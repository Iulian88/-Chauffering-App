import { Request } from 'express';
import { Trip, TripStatus, BookingStatus, AuthUser } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';
import { pool } from '../../shared/db/pg.client';
import {
  insertTrip,
  findTripById,
  findTripByIdGlobal,
  findTripByIdForDriver,
  findActiveTripForBooking,
  findAllTrips,
  findTripsByOperator,
  updateTripStatus,
  insertDispatchLog,
} from './trips.repository';
import { findBookingByIdGlobal } from '../bookings/bookings.repository';
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
const isPlatformWide = (role: string) => role === 'platform_admin' || role === 'superadmin';

export async function listTrips(user: AuthUser): Promise<Trip[]> {
  if (!isPlatformWide(user.role) && !user.operator_id) {
    throw AppError.forbidden('No operator scope');
  }
  return isPlatformWide(user.role)
    ? findAllTrips()
    : findTripsByOperator(user.operator_id as string);
}

export async function createTrip(input: CreateTripInput, user: AuthUser): Promise<Trip> {
  // Fetch booking without operator scope — scope is validated below
  const booking = await findBookingByIdGlobal(input.booking_id);
  if (!booking) throw AppError.notFound('Booking');

  // Operator staff can only dispatch bookings assigned to their operator
  if (!isPlatformWide(user.role)) {
    if (!user.operator_id) throw AppError.forbidden('No operator scope');
    if (!booking.operator_id) {
      throw AppError.unprocessable(
        'Booking must be assigned to an operator before dispatching',
        'OPERATOR_NOT_ASSIGNED',
      );
    }
    if (booking.operator_id !== user.operator_id) {
      throw AppError.forbidden('Booking is not assigned to your operator');
    }
  }

  // Resolve scoped operator — platform-wide users can dispatch pool bookings
  // by inheriting the operator from the chosen driver's record.
  let scopedOperatorId = booking.operator_id as string | null;
  if (!scopedOperatorId && isPlatformWide(user.role)) {
    const { rows: driverOpRows } = await pool.query(
      `SELECT operator_id FROM drivers WHERE id = $1`,
      [input.driver_id],
    );
    scopedOperatorId = driverOpRows[0]?.operator_id ?? null;
    if (!scopedOperatorId) {
      throw AppError.unprocessable(
        'Cannot dispatch an independent driver to an unassigned booking — assign an operator first',
        'OPERATOR_NOT_RESOLVED',
      );
    }
  }

  if (!scopedOperatorId) {
    throw AppError.unprocessable(
      'Booking must be assigned to an operator before dispatching',
      'OPERATOR_NOT_ASSIGNED',
    );
  }

  if (!['pending', 'confirmed'].includes(booking.status as string)) {
    throw AppError.unprocessable(
      `Booking cannot be dispatched (current status: '${booking.status}')`,
      'BOOKING_NOT_DISPATCHABLE',
    );
  }

  // Guard: prevent double-assignment via active-trip check
  // NOTE: the definitive atomicity guard is inside assign_driver_atomic (DB function).
  // This pre-flight check gives a faster, human-readable error before hitting the DB lock.
  const existingTrip = await findActiveTripForBooking(input.booking_id);
  if (existingTrip) {
    throw AppError.conflict(
      'An active trip already exists for this booking',
      'TRIP_ALREADY_EXISTS',
    );
  }

  // Verify driver exists, is active, and belongs to the booking's operator
  const { rows: driverRows } = await pool.query(
    `SELECT id, availability_status, is_active, operator_id FROM drivers
     WHERE id = $1 AND operator_id = $2`,
    [input.driver_id, scopedOperatorId],
  );
  const driver = driverRows[0];
  if (!driver) throw AppError.notFound('Driver');
  if (!driver.is_active) throw AppError.unprocessable('Driver is inactive', 'DRIVER_INACTIVE');

  // Verify vehicle belongs to the booking's operator
  const { rows: vehicleRows } = await pool.query(
    `SELECT id, is_active, operator_id FROM vehicles
     WHERE id = $1 AND operator_id = $2`,
    [input.vehicle_id, scopedOperatorId],
  );
  const vehicle = vehicleRows[0];
  if (!vehicle) throw AppError.notFound('Vehicle');
  if (!vehicle.is_active) throw AppError.unprocessable('Vehicle is inactive', 'VEHICLE_INACTIVE');

  // ── Atomic dispatch via pg transaction ──────────────────────────────────────
  // SELECT FOR UPDATE on driver row prevents concurrent double-assignment.
  const client = await pool.connect();
  let trip: Trip;
  try {
    await client.query('BEGIN');

    // Lock driver row and re-check availability
    const { rows: [lockedDriver] } = await client.query(
      `SELECT id, availability_status FROM drivers WHERE id = $1 FOR UPDATE`,
      [input.driver_id],
    );
    if (!lockedDriver) { await client.query('ROLLBACK'); throw AppError.notFound('Driver'); }
    if (lockedDriver.availability_status !== 'available') {
      await client.query('ROLLBACK');
      throw AppError.conflict(
        'Driver is not available — already assigned to an active trip',
        'DRIVER_ALREADY_ASSIGNED',
      );
    }

    // Insert the trip
    const { rows: [newTrip] } = await client.query(
      `INSERT INTO trips (booking_id, driver_id, vehicle_id, operator_id, status, assigned_at)
       VALUES ($1, $2, $3, $4, 'assigned', now()) RETURNING *`,
      [input.booking_id, input.driver_id, input.vehicle_id, scopedOperatorId],
    );

    // Set driver busy
    await client.query(
      `UPDATE drivers SET availability_status = 'busy', updated_at = now() WHERE id = $1`,
      [input.driver_id],
    );

    // Advance booking to dispatched; also stamps operator_id on pool bookings
    await client.query(
      `UPDATE bookings SET status = 'dispatched', dispatch_status = 'assigned', operator_id = COALESCE(operator_id, $2), updated_at = now() WHERE id = $1`,
      [input.booking_id, scopedOperatorId],
    );

    await client.query('COMMIT');
    trip = newTrip as Trip;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Audit log (non-atomic with the assignment — acceptable for audit trail)
  await insertDispatchLog({
    trip_id:     trip.id,
    booking_id:  input.booking_id,
    driver_id:   input.driver_id,
    assigned_by: user.id,
    action:      'assigned',
  });

  return trip;
}

// ─── Get trip ─────────────────────────────────────────────────────────────────
export async function getTrip(id: string, user: AuthUser): Promise<Trip> {
  let trip: Trip | null = null;

  if (user.role === 'driver') {
    // Drivers look up their own driver_id first
    const { rows: driverRows } = await pool.query(
      `SELECT id FROM drivers WHERE user_id = $1`,
      [user.id],
    );
    const driverRow = driverRows[0];
    if (!driverRow) throw AppError.notFound('Driver profile');
    trip = await findTripByIdForDriver(id, driverRow.id);
  } else {
    if (!isPlatformWide(user.role) && !user.operator_id) {
      throw AppError.forbidden('No operator scope');
    }
    trip = isPlatformWide(user.role)
      ? await findTripByIdGlobal(id)
      : await findTripById(id, user.operator_id as string);
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

// ─── Operator: start trip (assigned → en_route) ───────────────────────────────
// Allows an operator or dispatcher to force-start an assigned trip,
// bypassing the driver-accept step. Sets trip to en_route and booking to in_progress.
export async function startTrip(
  _req: Request,
  tripId: string,
  user: AuthUser,
): Promise<Trip> {
  const { rows } = await pool.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
  const trip = rows[0];
  if (!trip) throw AppError.notFound('Trip');

  // Scope: operator staff can only act on their own operator's trips
  if (!isPlatformWide(user.role) && user.operator_id && trip.operator_id !== user.operator_id) {
    throw AppError.forbidden('Trip is not in your operator scope');
  }

  // Guard 3: trip must have a driver before it can be started
  if (!trip.driver_id) {
    throw AppError.unprocessable('No driver assigned to this trip', 'NO_DRIVER_ASSIGNED');
  }

  if (trip.status !== 'assigned') {
    throw AppError.unprocessable(
      `Trip is not in assigned state (current: '${trip.status}')`,
      'TRIP_NOT_STARTABLE',
    );
  }

  const now = new Date().toISOString();

  const { rows: updatedRows } = await pool.query(
    `UPDATE trips SET status = 'en_route', en_route_at = $1, updated_at = $1 WHERE id = $2 RETURNING *`,
    [now, tripId],
  );
  const updated = updatedRows[0];
  if (!updated) throw AppError.internal('Failed to start trip');

  // Sync booking → in_progress
  await setBookingStatus(trip.booking_id, trip.operator_id, 'in_progress');

  return updated as Trip;
}

// ─── Operator: complete trip (en_route → completed) ───────────────────────────
// Marks trip completed, syncs booking to completed, and frees the driver.
export async function completeTrip(
  _req: Request,
  tripId: string,
  user: AuthUser,
): Promise<Trip> {
  const { rows } = await pool.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
  const trip = rows[0];
  if (!trip) throw AppError.notFound('Trip');

  // Scope: operator staff can only act on their own operator's trips
  if (!isPlatformWide(user.role) && user.operator_id && trip.operator_id !== user.operator_id) {
    throw AppError.forbidden('Trip is not in your operator scope');
  }

  if (trip.status !== 'en_route') {
    throw AppError.unprocessable(
      `Trip is not in en_route state (current: '${trip.status}')`,
      'TRIP_NOT_COMPLETABLE',
    );
  }

  const now = new Date().toISOString();

  const { rows: updatedRows } = await pool.query(
    `UPDATE trips SET status = 'completed', completed_at = $1, updated_at = $1 WHERE id = $2 RETURNING *`,
    [now, tripId],
  );
  const updated = updatedRows[0];
  if (!updated) throw AppError.internal('Failed to complete trip');

  // Sync booking → completed
  await setBookingStatus(trip.booking_id, trip.operator_id, 'completed');

  // Free the driver — idempotent guard via availability_status check
  const { rows: driverRows } = await pool.query(
    `SELECT availability_status FROM drivers WHERE id = $1`,
    [trip.driver_id],
  );
  if (driverRows[0]?.availability_status !== 'available') {
    await setDriverAvailability(trip.driver_id, 'available');
  }

  return updated as Trip;
}
