import { Request } from 'express';
import { Trip, AuthUser } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';
import { getSupabaseForRequest } from '../../shared/db/supabase.client';
import { findBookingByIdGlobal } from '../bookings/bookings.repository';
import { createTrip } from '../trips/trips.service';
import { insertDispatchLog } from '../trips/trips.repository';
import { setDispatchStatus } from '../bookings/bookings.repository';

export interface ManualAssignInput {
  booking_id: string;
  driver_id: string;
  vehicle_id: string;
}

export async function manualAssign(
  input: ManualAssignInput,
  user: AuthUser,
): Promise<Trip> {
  return createTrip(input, user);
}

export async function unassignTrip(tripId: string, user: AuthUser, req: Request): Promise<void> {
  const db = getSupabaseForRequest(req);
  const isPlatformWide = user.role === 'platform_admin' || user.role === 'superadmin';
  if (!isPlatformWide && !user.operator_id) throw AppError.forbidden('No operator scope');

  const tripQuery = db.from('trips').select('*').eq('id', tripId);
  const { data: trip, error } = await (
    isPlatformWide ? tripQuery : tripQuery.eq('operator_id', user.operator_id)
  ).single();

  if (error || !trip) throw AppError.notFound('Trip');

  if (!isPlatformWide && trip.operator_id !== user.operator_id) {
    throw AppError.forbidden('Trip is not assigned to your operator');
  }

  if (trip.status !== 'assigned') {
    throw AppError.unprocessable(
      `Cannot unassign a trip with status '${trip.status}'. Only 'assigned' trips can be unassigned.`,
      'TRIP_NOT_UNASSIGNABLE',
    );
  }

  await db.from('trips').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', tripId);
  await db.from('drivers').update({ availability_status: 'available', updated_at: new Date().toISOString() }).eq('id', trip.driver_id);
  await db.from('bookings').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', trip.booking_id);

  await insertDispatchLog({
    trip_id: trip.id,
    booking_id: trip.booking_id,
    driver_id: trip.driver_id,
    assigned_by: user.id,
    action: 'unassigned',
    note: 'Manually unassigned by operator',
  });
}

// ─── Dispatch Meta Types ──────────────────────────────────────────────────────

export type MatchType = 'exact' | 'fallback' | 'none';

export interface DispatchMeta {
  totalDrivers: number;
  withVehicle: number;
  exactMatches: number;
  fallbackUsed: boolean;
  reasonIfEmpty: string | null;
  matchType: MatchType;
  degraded: boolean; // true when fallback was used (soft-mode)
}

export interface AvailableDriversResult {
  data: unknown[];
  meta: DispatchMeta;
}

// ─── Segment Priority Map ─────────────────────────────────────────────────────
// Each key maps to an ordered list of acceptable vehicle segments.
// First entry = exact match. Subsequent entries = fallback tiers.

const SEGMENT_PRIORITY: Record<string, string[]> = {
  prime_lux:  ['prime_lux', 'executive'],
  business:   ['business', 'executive'],
  executive:  ['executive'],
  office_lux: ['office_lux', 'executive'],
  ride:       ['ride'],
};

interface DriverWithVehicle {
  id: string;
  user_id: string;
  license_number: string;
  availability_status: string;
  vehicle: {
    id: string;
    plate: string;
    make: string;
    model: string;
    year: number;
    segment: string;
    is_active: boolean;
  };
}

// ─── Config ──────────────────────────────────────────────────────────────────
// Set STRICT_DISPATCH_MODE=true in .env to disable fallback segment matching.
// In strict mode only vehicles with an exact segment match are returned.
const STRICT_DISPATCH_MODE = process.env.STRICT_DISPATCH_MODE === 'true';

function matchDriversBySegment(
  drivers: DriverWithVehicle[],
  bookingSegment: string,
): { exactMatches: DriverWithVehicle[]; fallbackMatches: DriverWithVehicle[]; usedFallback: boolean } {
  const priorities = SEGMENT_PRIORITY[bookingSegment] ?? [bookingSegment];

  const exactMatches = drivers.filter(d => d.vehicle.segment === bookingSegment);
  if (exactMatches.length > 0) {
    return { exactMatches, fallbackMatches: [], usedFallback: false };
  }

  // In strict mode, never fall back — only exact segment matches are valid.
  if (STRICT_DISPATCH_MODE) {
    console.log('[DISPATCH] STRICT_DISPATCH_MODE — fallback suppressed for segment:', bookingSegment);
    return { exactMatches: [], fallbackMatches: [], usedFallback: false };
  }

  // Try each fallback tier in order
  for (const fallbackSegment of priorities.slice(1)) {
    const fallbackMatches = drivers.filter(d => d.vehicle.segment === fallbackSegment);
    if (fallbackMatches.length > 0) {
      return { exactMatches: [], fallbackMatches, usedFallback: true };
    }
  }

  return { exactMatches: [], fallbackMatches: [], usedFallback: false };
}

// ─── Available Drivers Pipeline ───────────────────────────────────────────────

export async function getAvailableDriversForBooking(
  bookingId: string,
  user: AuthUser,
  req: Request,
): Promise<AvailableDriversResult> {
  const isPlatformWide = user.role === 'platform_admin' || user.role === 'superadmin';
  if (!isPlatformWide && !user.operator_id) {
    throw AppError.forbidden('No operator scope');
  }

  // ── Stage 1: Validate booking ─────────────────────────────────────────────
  const booking = await findBookingByIdGlobal(bookingId);
  if (!booking) throw AppError.notFound('Booking');

  const operatorId = booking.operator_id;
  const bookingSegment = booking.segment as string;

  console.log('[DISPATCH] Stage 1 — booking:', booking.id, '| operator_id:', operatorId, '| segment:', bookingSegment);

  if (!operatorId) {
    console.log('[DISPATCH] Stage 1 — BLOCKED: BOOKING_HAS_NO_OPERATOR');
    return {
      data: [],
      meta: { totalDrivers: 0, withVehicle: 0, exactMatches: 0, fallbackUsed: false, reasonIfEmpty: 'BOOKING_HAS_NO_OPERATOR', matchType: 'none', degraded: false },
    };
  }

  if (!isPlatformWide && operatorId !== user.operator_id) {
    throw AppError.forbidden('Booking is not assigned to your operator');
  }

  const { supabase: serviceClient } = await import('../../shared/db/supabase.client');

  // ── Stage 2: Fetch driver pool (no joins) ─────────────────────────────────
  const { data: rawDrivers, error: driversError } = await serviceClient
    .from('drivers')
    .select('id, user_id, license_number, availability_status')
    .eq('operator_id', operatorId)
    .eq('is_active', true)
    .eq('availability_status', 'available');

  if (driversError) throw AppError.internal(driversError.message);

  console.log('[DISPATCH] Stage 2 — DRIVER_POOL_COUNT:', rawDrivers?.length ?? 0);

  if (!rawDrivers || rawDrivers.length === 0) {
    return {
      data: [],
      meta: { totalDrivers: 0, withVehicle: 0, exactMatches: 0, fallbackUsed: false, reasonIfEmpty: 'NO_DRIVERS_FOR_OPERATOR', matchType: 'none', degraded: false },
    };
  }

  // ── Stage 3: Attach primary assignments ───────────────────────────────────
  const driverIds = rawDrivers.map((d: Record<string, unknown>) => d.id as string);

  const { data: assignments, error: assignError } = await serviceClient
    .from('driver_vehicle_assignments')
    .select('driver_id, vehicle_id, is_primary')
    .in('driver_id', driverIds)
    .eq('is_primary', true);

  if (assignError) throw AppError.internal(assignError.message);

  const driversWithAssignmentCount = new Set((assignments ?? []).map((a: { driver_id: string }) => a.driver_id)).size;
  console.log('[DISPATCH] Stage 3 — DRIVERS_WITH_ASSIGNMENT:', driversWithAssignmentCount, '/', rawDrivers.length);

  const assignmentByDriver = new Map(
    (assignments ?? []).map((a: { driver_id: string; vehicle_id: string; is_primary: boolean }) => [a.driver_id, a]),
  );

  // ── Stage 4: Attach vehicles (is_active = true) ───────────────────────────
  const vehicleIds = (assignments ?? []).map((a: { vehicle_id: string }) => a.vehicle_id);

  if (vehicleIds.length === 0) {
    console.log('[DISPATCH] Stage 4 — NO_VEHICLES_ASSIGNED: no vehicle IDs from assignments');
    return {
      data: [],
      meta: { totalDrivers: rawDrivers.length, withVehicle: 0, exactMatches: 0, fallbackUsed: false, reasonIfEmpty: 'NO_VEHICLES_ASSIGNED', matchType: 'none', degraded: false },
    };
  }

  const { data: vehicles, error: vehicleError } = await serviceClient
    .from('vehicles')
    .select('id, plate, make, model, year, segment, is_active')
    .in('id', vehicleIds)
    .eq('is_active', true);

  if (vehicleError) throw AppError.internal(vehicleError.message);

  const vehicleMap = new Map(
    (vehicles ?? []).map((v: { id: string; plate: string; make: string; model: string; year: number; segment: string; is_active: boolean }) => [v.id, v]),
  );

  // Build driver → vehicle list (inner join logic in app code)
  const driversWithVehicle: DriverWithVehicle[] = (rawDrivers as Record<string, unknown>[]).reduce<DriverWithVehicle[]>((acc, d) => {
    const assignment = assignmentByDriver.get(d.id as string);
    if (!assignment) return acc;
    const vehicle = vehicleMap.get(assignment.vehicle_id);
    if (!vehicle) return acc;
    acc.push({
      id: d.id as string,
      user_id: d.user_id as string,
      license_number: d.license_number as string,
      availability_status: d.availability_status as string,
      vehicle,
    });
    return acc;
  }, []);

  console.log('[DISPATCH] Stage 4 — DRIVERS_WITH_ACTIVE_VEHICLE:', driversWithVehicle.length, '/', rawDrivers.length);

  if (driversWithVehicle.length === 0) {
    return {
      data: [],
      meta: { totalDrivers: rawDrivers.length, withVehicle: 0, exactMatches: 0, fallbackUsed: false, reasonIfEmpty: 'NO_VEHICLES_ASSIGNED', matchType: 'none', degraded: false },
    };
  }

  // ── Stage 5: Segment matching with controlled fallback ────────────────────
  const { exactMatches, fallbackMatches, usedFallback } = matchDriversBySegment(driversWithVehicle, bookingSegment);
  const matched = usedFallback ? fallbackMatches : exactMatches;

  console.log(
    '[DISPATCH] Stage 5 — exactMatches:', exactMatches.length,
    '| fallbackMatches:', fallbackMatches.length,
    '| usedFallback:', usedFallback,
    '| bookingSegment:', bookingSegment,
    '| vehicleSegments:', driversWithVehicle.map(d => d.vehicle.segment),
  );

  if (matched.length === 0) {
    const strictReason = STRICT_DISPATCH_MODE ? 'NO_SEGMENT_MATCH_STRICT' : 'NO_SEGMENT_MATCH';
    console.log('[DISPATCH] Stage 5 —', strictReason, 'for segment:', bookingSegment);
    return {
      data: [],
      meta: {
        totalDrivers: rawDrivers.length,
        withVehicle: driversWithVehicle.length,
        exactMatches: 0,
        fallbackUsed: false,
        reasonIfEmpty: strictReason,
        matchType: 'none',
        degraded: false,
      },
    };
  }

  // ── Stage 6: Fetch user_profiles for matched drivers ─────────────────────
  const matchedUserIds = matched.map(d => d.user_id);

  const { data: profiles } = await serviceClient
    .from('user_profiles')
    .select('id, full_name, phone')
    .in('id', matchedUserIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string; phone: string | null }) => [p.id, p]),
  );

  const result = matched.map(d => ({
    id: d.id,
    user_id: d.user_id,
    license_number: d.license_number,
    availability_status: d.availability_status,
    user_profiles: profileMap.get(d.user_id) ?? null,
    vehicles: [d.vehicle],
  }));

  const matchType: MatchType = usedFallback ? 'fallback' : 'exact';
  console.log('[DISPATCH] Stage 6 — FINAL count:', result.length, '| matchType:', matchType);

  return {
    data: result,
    meta: {
      totalDrivers: rawDrivers.length,
      withVehicle: driversWithVehicle.length,
      exactMatches: exactMatches.length,
      fallbackUsed: usedFallback,
      reasonIfEmpty: null,
      matchType,
      degraded: usedFallback, // DEGRADED_MATCH: fallback was needed
    },
  };
}

// ─── Dispatch Data Audit ──────────────────────────────────────────────────────

export interface DispatchAuditReport {
  driversWithoutAssignment: { id: string; operator_id: string }[];
  assignmentsWithoutVehicle: { driver_id: string; vehicle_id: string }[];
  vehiclesWithoutSegment: { id: string; plate: string }[];
  operatorsWithoutDrivers: { id: string; name: string }[];
}

export async function auditDispatchData(): Promise<DispatchAuditReport> {
  const { supabase: serviceClient } = await import('../../shared/db/supabase.client');

  // Drivers with no primary assignment
  const { data: allDrivers } = await serviceClient
    .from('drivers')
    .select('id, operator_id')
    .eq('is_active', true);

  const { data: primaryAssignments } = await serviceClient
    .from('driver_vehicle_assignments')
    .select('driver_id, vehicle_id')
    .eq('is_primary', true);

  const assignedDriverIds = new Set((primaryAssignments ?? []).map((a: { driver_id: string }) => a.driver_id));

  const driversWithoutAssignment = (allDrivers ?? []).filter(
    (d: { id: string; operator_id: string }) => !assignedDriverIds.has(d.id),
  ) as { id: string; operator_id: string }[];

  // Assignments pointing to a non-existent or inactive vehicle
  const assignedVehicleIds = (primaryAssignments ?? []).map((a: { vehicle_id: string }) => a.vehicle_id);

  const { data: existingVehicles } = await serviceClient
    .from('vehicles')
    .select('id')
    .in('id', assignedVehicleIds.length > 0 ? assignedVehicleIds : ['00000000-0000-0000-0000-000000000000']);

  const existingVehicleIds = new Set((existingVehicles ?? []).map((v: { id: string }) => v.id));

  const assignmentsWithoutVehicle = (primaryAssignments ?? []).filter(
    (a: { vehicle_id: string }) => !existingVehicleIds.has(a.vehicle_id),
  ) as { driver_id: string; vehicle_id: string }[];

  // Vehicles with no segment
  const { data: vehiclesNoSegment } = await serviceClient
    .from('vehicles')
    .select('id, plate')
    .is('segment', null)
    .eq('is_active', true);

  // Operators with no active+available drivers
  const { data: allOperators } = await serviceClient
    .from('operators')
    .select('id, name')
    .eq('is_active', true);

  const operatorIdsWithDrivers = new Set(
    (allDrivers ?? []).map((d: { operator_id: string }) => d.operator_id),
  );

  const operatorsWithoutDrivers = (allOperators ?? []).filter(
    (o: { id: string }) => !operatorIdsWithDrivers.has(o.id),
  ) as { id: string; name: string }[];

  return {
    driversWithoutAssignment,
    assignmentsWithoutVehicle,
    vehiclesWithoutSegment: (vehiclesNoSegment ?? []) as { id: string; plate: string }[],
    operatorsWithoutDrivers,
  };
}

// ─── Operator Health Check ────────────────────────────────────────────────────

export interface OperatorHealth {
  operatorId: string;
  drivers: number;
  vehicles: number;
  segmentsCovered: string[];
  missingSegments: string[];
  hasNoCoverage: boolean; // true when operator cannot serve any segment
}

const ALL_SEGMENTS = Object.keys(SEGMENT_PRIORITY);

export async function checkOperatorHealth(operatorId: string): Promise<OperatorHealth> {
  const { supabase: serviceClient } = await import('../../shared/db/supabase.client');

  // Count active drivers
  const { data: drivers } = await serviceClient
    .from('drivers')
    .select('id')
    .eq('operator_id', operatorId)
    .eq('is_active', true);

  const driverCount = (drivers ?? []).length;
  if (driverCount === 0) {
    return {
      operatorId,
      drivers: 0,
      vehicles: 0,
      segmentsCovered: [],
      missingSegments: ALL_SEGMENTS,
      hasNoCoverage: true,
    };
  }

  // Find vehicles assigned to these drivers
  const driverIds = (drivers ?? []).map((d: { id: string }) => d.id);

  const { data: assignments } = await serviceClient
    .from('driver_vehicle_assignments')
    .select('vehicle_id')
    .in('driver_id', driverIds)
    .eq('is_primary', true);

  const vehicleIds = (assignments ?? []).map((a: { vehicle_id: string }) => a.vehicle_id);

  if (vehicleIds.length === 0) {
    return {
      operatorId,
      drivers: driverCount,
      vehicles: 0,
      segmentsCovered: [],
      missingSegments: ALL_SEGMENTS,
      hasNoCoverage: true,
    };
  }

  const { data: vehicles } = await serviceClient
    .from('vehicles')
    .select('segment')
    .in('id', vehicleIds)
    .eq('is_active', true)
    .not('segment', 'is', null);

  const vehicleCount = (vehicles ?? []).length;
  const vehicleSegments = new Set((vehicles ?? []).map((v: { segment: string }) => v.segment));

  // A segment is "covered" if there is an exact match OR a vehicle in a valid fallback tier
  const segmentsCovered: string[] = [];
  const missingSegments: string[] = [];

  for (const seg of ALL_SEGMENTS) {
    const tiers = SEGMENT_PRIORITY[seg] ?? [seg];
    const covered = tiers.some(t => vehicleSegments.has(t));
    if (covered) {
      segmentsCovered.push(seg);
    } else {
      missingSegments.push(seg);
    }
  }

  return {
    operatorId,
    drivers: driverCount,
    vehicles: vehicleCount,
    segmentsCovered,
    missingSegments,
    hasNoCoverage: segmentsCovered.length === 0,
  };
}

// ─── Failure Tracking ─────────────────────────────────────────────────────────
// Non-throwing: failure to write a failure log must never crash the request.

export async function insertDispatchFailure(
  bookingId: string,
  reason: string,
  meta: Record<string, unknown> | null,
): Promise<void> {
  const { supabase: svc } = await import('../../shared/db/supabase.client');
  const { error } = await svc
    .from('dispatch_failures')
    .insert({ booking_id: bookingId, reason, meta });
  if (error) {
    console.error('[DISPATCH] Could not write dispatch_failure record:', error.message);
  }
}

// ─── Auto Dispatch ────────────────────────────────────────────────────────────
// System-initiated assignment: calls the dispatch engine, picks the best
// available driver (exact segment > fallback), then atomically assigns.
//
// State machine transitions:
//   pending/ready → dispatching → assigned   (success path)
//              └──────────────→ failed       (no drivers or assignment conflict)

const SYSTEM_USER: AuthUser = {
  id:          '00000000-0000-0000-0000-000000000001',
  role:        'superadmin',
  operator_id: null,
  email:       'system@internal',
};

export async function autoDispatch(
  bookingId: string,
): Promise<{ trip: Trip; meta: DispatchMeta }> {
  const { supabase: svc } = await import('../../shared/db/supabase.client');

  // Validate booking exists and is not already handled
  const booking = await findBookingByIdGlobal(bookingId);
  if (!booking) throw AppError.notFound('Booking');

  if (booking.dispatch_status === 'assigned') {
    throw AppError.conflict('Booking is already dispatched', 'BOOKING_ALREADY_DISPATCHED');
  }
  if (booking.dispatch_status === 'dispatching') {
    throw AppError.conflict('Dispatch already in progress for this booking', 'DISPATCH_IN_PROGRESS');
  }

  // Transition → dispatching
  await setDispatchStatus(bookingId, 'dispatching');

  // Query available drivers via the full dispatch pipeline
  let result: AvailableDriversResult;
  try {
    result = await getAvailableDriversForBooking(bookingId, SYSTEM_USER, {} as Request);
  } catch (err) {
    const reason = err instanceof AppError ? err.message : 'DISPATCH_QUERY_ERROR';
    await insertDispatchFailure(bookingId, reason, null);
    await svc.from('bookings').update({ dispatch_status: 'failed', updated_at: new Date().toISOString() }).eq('id', bookingId);
    throw err;
  }

  if (result.data.length === 0) {
    const reason = result.meta.reasonIfEmpty ?? 'NO_DRIVERS_AVAILABLE';
    await insertDispatchFailure(bookingId, reason, result.meta as unknown as Record<string, unknown>);
    await svc.from('bookings').update({ dispatch_status: 'failed', updated_at: new Date().toISOString() }).eq('id', bookingId);
    throw AppError.unprocessable(reason, 'AUTO_DISPATCH_FAILED');
  }

  // Pick best driver: getAvailableDriversForBooking already returns exact matches
  // first (usedFallback=false path), so drivers[0] is always the best candidate.
  const candidates = result.data as Array<{ id: string; vehicles: Array<{ id: string }> }>;
  const chosen = candidates[0];
  const vehicleId = chosen.vehicles?.[0]?.id;

  if (!vehicleId) {
    const reason = 'CHOSEN_DRIVER_HAS_NO_VEHICLE';
    await insertDispatchFailure(bookingId, reason, null);
    await svc.from('bookings').update({ dispatch_status: 'failed', updated_at: new Date().toISOString() }).eq('id', bookingId);
    throw AppError.unprocessable('Chosen driver has no vehicle', reason);
  }

  // Atomic assignment (may fail with DRIVER_ALREADY_ASSIGNED under concurrent load)
  try {
    const trip = await createTrip(
      { booking_id: bookingId, driver_id: chosen.id, vehicle_id: vehicleId },
      SYSTEM_USER,
    );
    // dispatch_status = 'assigned' is set atomically by assign_driver_atomic in the DB
    console.log('[AUTO_DISPATCH] Success — booking:', bookingId, '| driver:', chosen.id, '| matchType:', result.meta.matchType);
    return { trip, meta: result.meta };
  } catch (err) {
    const code = err instanceof AppError ? (err.code ?? err.message) : 'ASSIGN_FAILED';
    await insertDispatchFailure(bookingId, code, { driver_id: chosen.id });
    // Only mark failed if we didn't just lose a race (DRIVER_ALREADY_ASSIGNED is retriable)
    if (code !== 'DRIVER_ALREADY_ASSIGNED') {
      await svc.from('bookings').update({ dispatch_status: 'failed', updated_at: new Date().toISOString() }).eq('id', bookingId);
    } else {
      // Reset to 'ready' so the caller can retry with a different driver
      await setDispatchStatus(bookingId, 'ready');
    }
    throw err;
  }
}
