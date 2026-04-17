import {
  Booking,
  AuthUser,
  DriverAffiliationStatus,
  VehicleSegment,
} from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';
import {
  findActiveOperators,
  findPendingOperatorBookings,
  acceptMarketplaceRequest,
  findPendingDriverJobs,
  findPrimaryVehicleForDriver,
  claimDriverJob,
  findAffiliationsByDriver,
  findAffiliationsByOperator,
  findAllAffiliations,
  requestAffiliation,
  findAffiliationById,
  updateAffiliationStatus,
  findFavoriteDriversForClient,
  addFavoriteDriver,
  removeFavoriteDriver,
  findActiveDriver,
} from './marketplace.repository';
import { createBooking } from '../bookings/bookings.repository';
import { calculatePrice, defaultSnapshotForSegment } from '../pricing/pricing.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isPlatform = (role: string) =>
  role === 'platform_admin' || role === 'superadmin';

// ─── Operators ────────────────────────────────────────────────────────────────

export async function listMarketplaceOperators() {
  return findActiveOperators();
}

// ─── Marketplace Requests ─────────────────────────────────────────────────────

export interface CreateMarketplaceRequestInput {
  segment: VehicleSegment;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  stops?: { address: string; lat: number; lng: number; order: number }[] | null;
  scheduled_at: string;
  distance_km: number;
  duration_sec: number;
  client_price?: number | null;
  offer_expires_at?: string | null;
}

/**
 * Client posts a ride request to the operator marketplace.
 * Booking is created with status 'pending_operator' and marketplace_visible = true.
 * Any active operator can accept it.
 */
export async function createMarketplaceRequest(
  input: CreateMarketplaceRequestInput,
  user: AuthUser,
): Promise<Booking> {
  if (user.role !== 'client' && !isPlatform(user.role)) {
    throw AppError.forbidden('Only clients or platform admins can post marketplace requests');
  }

  const snapshot = defaultSnapshotForSegment(input.segment);
  const { price } = calculatePrice({
    distance_km: input.distance_km,
    duration_sec: input.duration_sec,
    segment: input.segment,
    snapshot,
  });

  const booking = await createBooking({
    operator_id:             null,
    client_user_id:          user.id,
    pricing_rule_id:         null,
    status:                  'pending_operator',
    dispatch_status:         'pending',
    segment:                 input.segment,
    pickup_address:          input.pickup_address,
    pickup_lat:              input.pickup_lat,
    pickup_lng:              input.pickup_lng,
    dropoff_address:         input.dropoff_address,
    dropoff_lat:             input.dropoff_lat,
    dropoff_lng:             input.dropoff_lng,
    stops:                   input.stops ?? null,
    scheduled_at:            input.scheduled_at,
    price_estimate:          price,
    currency:                snapshot.currency,
    distance_km:             input.distance_km,
    duration_sec:            input.duration_sec,
    pricing_snapshot:        snapshot,
    channel:                 'marketplace',
    partner:                 'marketplace',
    client_price:            input.client_price ?? null,
    driver_price:            null,
    profit:                  null,
    marketplace_visible:     true,
    accepted_by_operator_id: null,
    offer_expires_at:        input.offer_expires_at ?? null,
  });

  return booking;
}

export async function listMarketplaceRequests(user: AuthUser, segment?: string) {
  // Only operator roles and platform admins see the pending pool
  if (
    !isPlatform(user.role) &&
    user.role !== 'operator_admin' &&
    user.role !== 'operator_dispatcher'
  ) {
    throw AppError.forbidden('Only operators can view marketplace requests');
  }
  return findPendingOperatorBookings(segment);
}

/**
 * Operator atomically accepts a marketplace request.
 * First-wins: if already taken, throws 409 Conflict.
 */
export async function acceptRequest(
  booking_id: string,
  user: AuthUser,
): Promise<Booking> {
  if (
    !isPlatform(user.role) &&
    user.role !== 'operator_admin' &&
    user.role !== 'operator_dispatcher'
  ) {
    throw AppError.forbidden('Only operators can accept marketplace requests');
  }

  const operator_id = isPlatform(user.role)
    ? null // platform acting as themselves — not standard; they'd pass body. Guard below.
    : user.operator_id;

  if (!operator_id) {
    throw AppError.badRequest('No operator scope on your account');
  }

  const booking = await acceptMarketplaceRequest(booking_id, operator_id);

  if (!booking) {
    throw AppError.conflict(
      'This request was already accepted by another operator',
      'REQUEST_ALREADY_TAKEN',
    );
  }

  return booking;
}

// ─── Job Board ────────────────────────────────────────────────────────────────

export async function listJobBoard(
  user: AuthUser,
  segment?: string,
) {
  // Drivers and platform staff can see the job board
  if (user.role !== 'driver' && !isPlatform(user.role)) {
    throw AppError.forbidden('Only drivers can view the job board');
  }
  return findPendingDriverJobs(segment);
}

/**
 * Self-employed driver claims a job from the board.
 * - Driver must be active
 * - Driver must have a primary vehicle assigned
 * - Booking must still be in 'pending_driver' and not expired
 * - Atomic transaction: update booking + insert trip
 */
export async function claimJob(
  booking_id: string,
  user: AuthUser,
): Promise<{ booking: Booking; trip_id: string }> {
  if (user.role !== 'driver') {
    throw AppError.forbidden('Only drivers can claim jobs');
  }

  // The driver record id is not the same as user.id (user.id is the users table PK)
  // We need the driver record. Look it up by user_id.
  const driver = await findDriverRecordByUserId(user.id);
  if (!driver) {
    throw AppError.notFound('Driver profile');
  }
  if (!driver.is_active) {
    throw AppError.forbidden('Driver account is not active');
  }

  // Require a primary vehicle to create a trip
  const vehicleRow = await findPrimaryVehicleForDriver(driver.id);
  if (!vehicleRow) {
    throw AppError.badRequest(
      'No primary vehicle assigned. Assign a vehicle before claiming jobs.',
      'NO_VEHICLE',
    );
  }

  const result = await claimDriverJob({
    booking_id,
    driver_id: driver.id,
    vehicle_id: vehicleRow.vehicle_id,
    operator_id: vehicleRow.operator_id ?? driver.operator_id,
  });

  if (!result) {
    throw AppError.conflict(
      'This job was already claimed by another driver',
      'JOB_ALREADY_TAKEN',
    );
  }

  return result;
}

// ─── Affiliations ─────────────────────────────────────────────────────────────

export async function listMyAffiliations(user: AuthUser) {
  if (user.role === 'driver') {
    const driver = await findDriverRecordByUserId(user.id);
    if (!driver) throw AppError.notFound('Driver profile');
    return findAffiliationsByDriver(driver.id);
  }

  if (isPlatform(user.role)) {
    // Platform admins see all affiliations across all operators
    return findAllAffiliations();
  }

  if (
    user.role === 'operator_admin' ||
    user.role === 'operator_dispatcher'
  ) {
    if (!user.operator_id) {
      throw AppError.forbidden('No operator scope on your account');
    }
    return findAffiliationsByOperator(user.operator_id);
  }

  throw AppError.forbidden('Cannot list affiliations for your role');
}

export async function requestDriverAffiliation(
  operator_id: string,
  note: string | null,
  user: AuthUser,
): Promise<unknown> {
  if (user.role !== 'driver') {
    throw AppError.forbidden('Only drivers can request affiliations');
  }
  const driver = await findDriverRecordByUserId(user.id);
  if (!driver) throw AppError.notFound('Driver profile');
  return requestAffiliation(driver.id, operator_id, note);
}

export async function updateAffiliation(
  affiliation_id: string,
  status: DriverAffiliationStatus,
  commission_pct: number | null,
  user: AuthUser,
): Promise<unknown> {
  if (
    !isPlatform(user.role) &&
    user.role !== 'operator_admin'
  ) {
    throw AppError.forbidden('Only operator admins can update affiliations');
  }

  const aff = await findAffiliationById(affiliation_id);
  if (!aff) throw AppError.notFound('Affiliation');

  // Operator admin can only manage their own operator's affiliations
  if (!isPlatform(user.role) && aff.operator_id !== user.operator_id) {
    throw AppError.forbidden('Cannot manage affiliations for another operator');
  }

  return updateAffiliationStatus(affiliation_id, status, commission_pct);
}

// ─── Favorites ────────────────────────────────────────────────────────────────

export async function listMyFavorites(user: AuthUser) {
  if (user.role !== 'client') {
    throw AppError.forbidden('Only clients have favorite drivers');
  }
  return findFavoriteDriversForClient(user.id);
}

export async function addToFavorites(driver_id: string, user: AuthUser) {
  if (user.role !== 'client') {
    throw AppError.forbidden('Only clients can add favorite drivers');
  }
  // Validate driver exists and is active
  const driver = await findActiveDriver(driver_id);
  if (!driver) throw AppError.notFound('Driver');
  return addFavoriteDriver(user.id, driver_id);
}

export async function removeFromFavorites(driver_id: string, user: AuthUser) {
  if (user.role !== 'client') {
    throw AppError.forbidden('Only clients can remove favorite drivers');
  }
  const removed = await removeFavoriteDriver(user.id, driver_id);
  if (!removed) throw AppError.notFound('Favorite');
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async function findDriverRecordByUserId(user_id: string) {
  // Import lazily to avoid circular deps — drivers.repository is independent
  const { pool } = await import('../../shared/db/pg.client');
  const { rows } = await pool.query(
    `SELECT id, operator_id, is_active, availability_status
     FROM drivers WHERE user_id = $1 LIMIT 1`,
    [user_id],
  );
  return rows[0] as {
    id: string;
    operator_id: string | null;
    is_active: boolean;
    availability_status: string;
  } | undefined;
}
