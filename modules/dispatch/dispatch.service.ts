import { Request } from 'express';
import { Trip, AuthUser } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';
import { getSupabaseForRequest } from '../../shared/db/supabase.client';
import { findBookingByIdGlobal } from '../bookings/bookings.repository';
import { createTrip } from '../trips/trips.service';
import { insertDispatchLog } from '../trips/trips.repository';

export interface ManualAssignInput {
  booking_id: string;
  driver_id: string;
  vehicle_id: string;
}

/**
 * Manual assignment — operator chooses driver explicitly.
 * All guard logic lives in trips.service.createTrip.
 * This layer exists so auto-dispatch can be swapped in later
 * without touching the trips module.
 */
export async function manualAssign(
  input: ManualAssignInput,
  user: AuthUser,
): Promise<Trip> {
  return createTrip(input, user);
}

/**
 * Unassign a driver from a trip that hasn't been accepted yet.
 * Returns the booking to 'confirmed' so it can be reassigned.
 */
export async function unassignTrip(tripId: string, user: AuthUser, req: Request): Promise<void> {
  const db = getSupabaseForRequest(req);
  const isPlatformWide = user.role === 'platform_admin' || user.role === 'superadmin';
  if (!isPlatformWide && !user.operator_id) throw AppError.forbidden('No operator scope');

  const tripQuery = db.from('trips').select('*').eq('id', tripId);
  const { data: trip, error } = await (
    isPlatformWide ? tripQuery : tripQuery.eq('operator_id', user.operator_id)
  ).single();

  if (error || !trip) throw AppError.notFound('Trip');

  // Operator staff can only unassign trips belonging to their operator
  if (!isPlatformWide && trip.operator_id !== user.operator_id) {
    throw AppError.forbidden('Trip is not assigned to your operator');
  }

  if (trip.status !== 'assigned') {
    throw AppError.unprocessable(
      `Cannot unassign a trip with status '${trip.status}'. Only 'assigned' trips can be unassigned.`,
      'TRIP_NOT_UNASSIGNABLE',
    );
  }

  // Cancel the trip
  await db
    .from('trips')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', tripId);

  // Release driver
  await db
    .from('drivers')
    .update({ availability_status: 'available', updated_at: new Date().toISOString() })
    .eq('id', trip.driver_id);

  // Return booking to confirmed — use trip.operator_id (the booking's actual owner)
  await db
    .from('bookings')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', trip.booking_id);

  // Audit
  await insertDispatchLog({
    trip_id: trip.id,
    booking_id: trip.booking_id,
    driver_id: trip.driver_id,
    assigned_by: user.id,
    action: 'unassigned',
    note: 'Manually unassigned by operator',
  });
}

export async function getAvailableDriversForBooking(
  bookingId: string,
  user: AuthUser,
  req: Request,
): Promise<unknown[]> {
  console.log('AUTH HEADER:', req.headers.authorization);

  const isPlatformWide = user.role === 'platform_admin' || user.role === 'superadmin';
  if (!isPlatformWide && !user.operator_id) {
    throw AppError.forbidden('No operator scope');
  }

  // Fetch booking via service-role (auth already validated by middleware)
  const booking = await findBookingByIdGlobal(bookingId);
  console.log('BOOKING RESULT:', booking);

  if (!booking) throw AppError.notFound('Booking');

  const operatorId = booking.operator_id;
  console.log('OPERATOR ID:', operatorId);
  console.log('BOOKING SEGMENT:', booking.segment);

  // Null check FIRST: if booking has no operator yet, no drivers are scoped
  if (!operatorId) return [];

  // Enforce scope: operator staff can only dispatch bookings belonging to their operator
  if (!isPlatformWide && operatorId !== user.operator_id) {
    throw AppError.forbidden('Booking is not assigned to your operator');
  }

  // Use service-role client for the driver query — auth is already validated by requireAuth
  // middleware and scope is enforced above. The user-scoped (anon+JWT) client triggers RLS
  // on driver_vehicle_assignments and vehicles, causing !inner joins to silently return zero
  // rows when the policy does not grant the operator user direct read access.
  const { supabase: serviceClient } = await import('../../shared/db/supabase.client');

  const { data: drivers, error } = await serviceClient
    .from('drivers')
    .select(`
      id, user_id, license_number, availability_status,
      driver_vehicle_assignments!inner(
        is_primary,
        vehicles!inner(id, plate, make, model, year, segment)
      )
    `)
    .eq('operator_id', operatorId)
    .eq('is_active', true)
    .eq('availability_status', 'available')
    .eq('driver_vehicle_assignments.is_primary', true)
    .eq('driver_vehicle_assignments.vehicles.segment', booking.segment)
    .eq('driver_vehicle_assignments.vehicles.is_active', true);

  console.log('DRIVERS FOUND:', drivers?.length ?? 0);
  if (error) throw AppError.internal(error.message);
  if (!drivers || drivers.length === 0) return [];

  // 2. Fetch user_profiles for name/phone display (service-role — same reason as above)
  const userIds = drivers.map((d: Record<string, unknown>) => d.user_id as string);
  const { data: profiles } = await serviceClient
    .from('user_profiles')
    .select('id, full_name, phone')
    .in('id', userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string; phone: string | null }) => [p.id, p]),
  );

  // 3. Merge — vehicle comes from the assignment join, not assigned_driver_id
  const result = (drivers as unknown as Record<string, unknown>[]).map(d => {
    // driver_vehicle_assignments may come back as an object (to-one) in some PostgREST
    // versions — normalise to array so .map() never throws.
    const raw = d.driver_vehicle_assignments;
    const assignments: { vehicles: Record<string, unknown> }[] = Array.isArray(raw)
      ? (raw as { vehicles: Record<string, unknown> }[])
      : raw
        ? [raw as { vehicles: Record<string, unknown> }]
        : [];
    return {
      ...d,
      user_profiles: profileMap.get(d.user_id as string) ?? null,
      vehicles: assignments.map(a => a.vehicles),
    };
  });

  console.log('RESPONSE DRIVER COUNT:', result.length, '| first vehicle count:', (result[0]?.vehicles as unknown[])?.length ?? 0);
  return result;
}
