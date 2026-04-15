import { Booking, BookingStatus, AuthUser } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';
import { calculatePrice, defaultSnapshotForSegment } from '../pricing/pricing.service';
import { getActiveRuleSnapshot } from '../pricing/pricing.repository';
import {
  createBooking,
  findBookingById,
  findBookingByIdForClient,
  listBookings,
  updateBookingStatus,
  ListBookingsFilter,
} from './bookings.repository';
import { CreateBookingInput, CancelBookingInput } from './bookings.schema';

// ─── Cancellable statuses ─────────────────────────────────────────────────────
const CANCELLABLE_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'dispatched'];

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createBookingForClient(
  input: CreateBookingInput,
  user: AuthUser,
  operator_id: string,
): Promise<Booking> {
  // Resolve pricing snapshot (fall back to defaults if no rule configured)
  const snapshot =
    (await getActiveRuleSnapshot(operator_id, input.segment)) ??
    defaultSnapshotForSegment(input.segment);

  const { price } = calculatePrice({
    distance_km: input.distance_km,
    duration_sec: input.duration_sec,
    segment: input.segment,
    snapshot,
  });

  const client_price = input.client_price ?? null;
  const driver_price = input.driver_price ?? null;
  const profit = client_price !== null && driver_price !== null
    ? client_price - driver_price
    : null;

  return createBooking({
    operator_id,
    client_user_id: user.id,
    pricing_rule_id: snapshot.rule_id === 'default' ? null : snapshot.rule_id,
    status: 'pending',
    segment: input.segment,
    pickup_address: input.pickup_address,
    pickup_lat: input.pickup_lat,
    pickup_lng: input.pickup_lng,
    dropoff_address: input.dropoff_address,
    dropoff_lat: input.dropoff_lat,
    dropoff_lng: input.dropoff_lng,
    stops: input.stops ?? null,
    scheduled_at: input.scheduled_at,
    price_estimate: price,
    currency: snapshot.currency,
    distance_km: input.distance_km,
    duration_sec: input.duration_sec,
    pricing_snapshot: snapshot,
    channel: input.channel ?? 'manual',
    partner: input.partner ?? 'internal',
    client_price,
    driver_price,
    profit,
    status_details: undefined,
  } as Parameters<typeof createBooking>[0]);
}

// ─── List (operator) ──────────────────────────────────────────────────────────
export async function getOperatorBookings(
  filter: Omit<ListBookingsFilter, 'operator_id'>,
  user: AuthUser,
): Promise<Booking[]> {
  const isPlatformWide = user.role === 'platform_admin' || user.role === 'superadmin';
  if (!isPlatformWide && !user.operator_id) {
    throw AppError.forbidden('No operator scope');
  }
  // platform_admin/superadmin: omit operator_id filter → returns all bookings
  // operator users: scoped to their tenant
  return listBookings({ ...filter, operator_id: isPlatformWide ? null : user.operator_id });
}

// ─── Get single ───────────────────────────────────────────────────────────────
export async function getBooking(id: string, user: AuthUser): Promise<Booking> {
  let booking: Booking | null = null;

  if (user.role === 'client') {
    booking = await findBookingByIdForClient(id, user.id);
  } else {
    if (user.role !== 'platform_admin' && user.role !== 'superadmin' && !user.operator_id) {
      throw AppError.forbidden('No operator scope');
    }
    booking = await findBookingById(id, user.operator_id as string);
  }

  if (!booking) throw AppError.notFound('Booking');
  return booking;
}

// ─── Cancel ───────────────────────────────────────────────────────────────────
export async function cancelBooking(
  id: string,
  input: CancelBookingInput,
  user: AuthUser,
): Promise<Booking> {
  const booking = await getBooking(id, user);

  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    throw AppError.unprocessable(
      `Booking in status '${booking.status}' cannot be cancelled`,
      'BOOKING_NOT_CANCELLABLE',
    );
  }

  // Clients can only cancel their own bookings
  if (user.role === 'client' && booking.client_user_id !== user.id) {
    throw AppError.forbidden('You can only cancel your own bookings');
  }

  const operator_id = booking.operator_id;

  return updateBookingStatus(id, operator_id, 'cancelled', {
    cancellation_reason: input.cancellation_reason ?? null,
    cancelled_by: user.id,
    cancelled_at: new Date().toISOString(),
  });
}

// ─── Confirm (operator only) ─────────────────────────────────────────────────
export async function confirmBooking(id: string, user: AuthUser): Promise<Booking> {
  if (user.role !== 'platform_admin' && user.role !== 'superadmin' && !user.operator_id) {
    throw AppError.forbidden('No operator scope');
  }

  const booking = await findBookingById(id, user.operator_id as string);
  if (!booking) throw AppError.notFound('Booking');

  if (booking.status !== 'pending') {
    throw AppError.unprocessable(
      `Booking must be 'pending' to confirm (current: '${booking.status}')`,
      'BOOKING_NOT_CONFIRMABLE',
    );
  }

  return updateBookingStatus(id, user.operator_id as string, 'confirmed');
}

// ─── Internal: advance status (called by dispatch/trips services) ─────────────
export async function setBookingStatus(
  id: string,
  operator_id: string,
  status: BookingStatus,
): Promise<void> {
  await updateBookingStatus(id, operator_id, status);
}
