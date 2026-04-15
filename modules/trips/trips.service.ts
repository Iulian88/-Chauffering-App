import { Trip, TripStatus, BookingStatus, AuthUser } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';
import {
  insertTrip,
  findTripById,
  findTripByIdForDriver,
  findActiveTripForBooking,
  findTripsByOperator,
  updateTripStatus,
  insertDispatchLog,
} from './trips.repository';
import { findBookingById } from '../bookings/bookings.repository';
import { setBookingStatus } from '../bookings/bookings.service';
import { setDriverAvailability } from '../drivers/drivers.repository';
import { CreateTripInput, RefuseTripInput, UpdateTripStatusInput } from './trips.schema';

// ─── Transition map ───────────────────────────────────────────────────────────
// Maps current trip status → allowed next statuses
const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  assigned:  ['accepted', 'refused'],
  accepted:  ['en_route'],
  en_route:  ['arrived'],
  arrived:   ['completed'],
  completed: [],
  refused:   [],
  cancelled: [],
};

// Trip status → corresponding booking status
const TRIP_TO_BOOKING_STATUS: Partial<Record<TripStatus, BookingStatus>> = {
  accepted:  'dispatched',
  en_route:  'in_progress',
  arrived:   'in_progress',
  completed: 'completed',
  refused:   'confirmed', // returns to pool for reassignment
};

// ─── Timestamp field for each status ─────────────────────────────────────────
function timestampFieldFor(status: TripStatus): Record<string, string> {
  const now = new Date().toISOString();
  const map: Partial<Record<TripStatus, Record<string, string>>> = {
    accepted:  { accepted_at: now },
    en_route:  { en_route_at: now },
    arrived:   { arrived_at: now },
    completed: { completed_at: now },
    refused:   { refused_at: now },
  };
  return map[status] ?? {};
}

// ─── Create trip (operator dispatches a booking) ──────────────────────────────
// NOTE: concurrency safety is enforced here in application layer.
// For production, prefer the DB-level assign_driver_to_trip() function instead.
export async function listTrips(user: AuthUser): Promise<Trip[]> {
  if (user.role !== 'platform_admin' && user.role !== 'superadmin' && !user.operator_id) {
    throw AppError.forbidden('No operator scope');
  }
  return findTripsByOperator(user.operator_id as string);
}

export async function createTrip(input: CreateTripInput, user: AuthUser): Promise<Trip> {
  if (!user.operator_id) throw AppError.forbidden('No operator scope');

  const booking = await findBookingById(input.booking_id, user.operator_id);
  if (!booking) throw AppError.notFound('Booking');

  if (booking.status !== 'confirmed') {
    throw AppError.unprocessable(
      `Booking must be 'confirmed' before dispatching (current: '${booking.status}')`,
      'BOOKING_NOT_DISPATCHABLE',
    );
  }

  // Guard: prevent double-assignment
  const existingTrip = await findActiveTripForBooking(input.booking_id);
  if (existingTrip) {
    throw AppError.conflict(
      'An active trip already exists for this booking',
      'TRIP_ALREADY_EXISTS',
    );
  }

  // Verify driver is available and belongs to this operator
  const { data: driver, error: driverError } = await (
    await import('../../shared/db/supabase.client')
  ).supabase
    .from('drivers')
    .select('id, availability_status, is_active, operator_id')
    .eq('id', input.driver_id)
    .eq('operator_id', user.operator_id)
    .single();

  if (driverError || !driver) throw AppError.notFound('Driver');
  if (!driver.is_active) throw AppError.unprocessable('Driver is inactive', 'DRIVER_INACTIVE');
  if (driver.availability_status !== 'available') {
    throw AppError.conflict(
      `Driver is not available (current status: '${driver.availability_status}')`,
      'DRIVER_NOT_AVAILABLE',
    );
  }

  // Verify vehicle belongs to this operator
  const { data: vehicle, error: vehicleError } = await (
    await import('../../shared/db/supabase.client')
  ).supabase
    .from('vehicles')
    .select('id, is_active, operator_id')
    .eq('id', input.vehicle_id)
    .eq('operator_id', user.operator_id)
    .single();

  if (vehicleError || !vehicle) throw AppError.notFound('Vehicle');
  if (!vehicle.is_active) throw AppError.unprocessable('Vehicle is inactive', 'VEHICLE_INACTIVE');

  // All guards passed — create trip
  const trip = await insertTrip({
    booking_id: input.booking_id,
    driver_id: input.driver_id,
    vehicle_id: input.vehicle_id,
    operator_id: user.operator_id,
    status: 'assigned',
  });

  // Set driver → busy
  await setDriverAvailability(input.driver_id, 'busy');

  // Advance booking → dispatched
  await setBookingStatus(input.booking_id, user.operator_id, 'dispatched');

  // Audit log
  await insertDispatchLog({
    trip_id: trip.id,
    booking_id: input.booking_id,
    driver_id: input.driver_id,
    assigned_by: user.id,
    action: 'assigned',
  });

  return trip;
}

// ─── Get trip ─────────────────────────────────────────────────────────────────
export async function getTrip(id: string, user: AuthUser): Promise<Trip> {
  let trip: Trip | null = null;

  if (user.role === 'driver') {
    // Drivers look up their own driver_id first
    const { data: driverRow } = await (
      await import('../../shared/db/supabase.client')
    ).supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!driverRow) throw AppError.notFound('Driver profile');
    trip = await findTripByIdForDriver(id, driverRow.id);
  } else {
    if (user.role !== 'platform_admin' && user.role !== 'superadmin' && !user.operator_id) {
      throw AppError.forbidden('No operator scope');
    }
    trip = await findTripById(id, user.operator_id as string);
  }

  if (!trip) throw AppError.notFound('Trip');
  return trip;
}

// ─── Driver: accept ───────────────────────────────────────────────────────────
export async function acceptTrip(id: string, user: AuthUser): Promise<Trip> {
  const trip = await getTrip(id, user);
  return advanceTripStatus(trip, 'accepted', user);
}

// ─── Driver: refuse ───────────────────────────────────────────────────────────
export async function refuseTrip(
  id: string,
  input: RefuseTripInput,
  user: AuthUser,
): Promise<Trip> {
  const trip = await getTrip(id, user);
  return advanceTripStatus(trip, 'refused', user, input.refusal_reason);
}

// ─── Driver: advance status (en_route / arrived / completed) ─────────────────
export async function advanceTripStatusByDriver(
  id: string,
  input: UpdateTripStatusInput,
  user: AuthUser,
): Promise<Trip> {
  const trip = await getTrip(id, user);
  return advanceTripStatus(trip, input.status, user);
}

// ─── Core state machine ───────────────────────────────────────────────────────
async function advanceTripStatus(
  trip: Trip,
  newStatus: TripStatus,
  user: AuthUser,
  refusalReason?: string,
): Promise<Trip> {
  const allowed = ALLOWED_TRANSITIONS[trip.status];

  if (!allowed.includes(newStatus)) {
    throw AppError.unprocessable(
      `Cannot transition trip from '${trip.status}' to '${newStatus}'`,
      'INVALID_TRIP_TRANSITION',
    );
  }

  const extra: Record<string, unknown> = {
    ...timestampFieldFor(newStatus),
    ...(newStatus === 'refused' && refusalReason ? { refusal_reason: refusalReason } : {}),
  };

  const updated = await updateTripStatus(trip.id, newStatus, extra);

  // Sync booking status
  const bookingStatus = TRIP_TO_BOOKING_STATUS[newStatus];
  if (bookingStatus) {
    await setBookingStatus(trip.booking_id, trip.operator_id, bookingStatus);
  }

  // Release driver on terminal states
  if (newStatus === 'completed' || newStatus === 'refused') {
    await setDriverAvailability(trip.driver_id, 'available');
  }

  // Audit refusal
  if (newStatus === 'refused') {
    await insertDispatchLog({
      trip_id: trip.id,
      booking_id: trip.booking_id,
      driver_id: trip.driver_id,
      assigned_by: user.id,
      action: 'assigned',
      outcome: 'refused',
      note: refusalReason ?? null,
    });
  }

  return updated;
}
