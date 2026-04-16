import { Trip, AuthUser } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';
import { supabase } from '../../shared/db/supabase.client';
import { findBookingById } from '../bookings/bookings.repository';
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
export async function unassignTrip(tripId: string, user: AuthUser): Promise<void> {
  const isPlatformWide = user.role === 'platform_admin' || user.role === 'superadmin';
  if (!isPlatformWide && !user.operator_id) throw AppError.forbidden('No operator scope');

  const tripQuery = supabase.from('trips').select('*').eq('id', tripId);
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
  await supabase
    .from('trips')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', tripId);

  // Release driver
  await supabase
    .from('drivers')
    .update({ availability_status: 'available', updated_at: new Date().toISOString() })
    .eq('id', trip.driver_id);

  // Return booking to confirmed — use trip.operator_id (the booking's actual owner)
  await supabase
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

/**
 * List available drivers for a given operator + segment.
 * Used by the operator UI to populate the assignment picker.
 */
export async function getAvailableDriversForBooking(
  bookingId: string,
  user: AuthUser,
): Promise<unknown[]> {
  if (user.role !== 'platform_admin' && user.role !== 'superadmin' && !user.operator_id) {
    throw AppError.forbidden('No operator scope');
  }

  const booking = await findBookingById(bookingId, user.operator_id as string);
  if (!booking) throw AppError.notFound('Booking');

  // 1. Find available drivers with a matching-segment vehicle
  const { data: drivers, error } = await supabase
    .from('drivers')
    .select('id, user_id, license_number, availability_status')
    .eq('operator_id', user.operator_id)
    .eq('is_active', true)
    .eq('availability_status', 'available');

  if (error) throw AppError.internal(error.message);
  if (!drivers || drivers.length === 0) return [];

  // 2. Fetch user_profiles for name/phone display
  const userIds = drivers.map((d: Record<string, unknown>) => d.user_id as string);
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, phone')
    .in('id', userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string; phone: string | null }) => [p.id, p]),
  );

  // 3. Fetch vehicles for these drivers that match the booking segment
  const driverIds = drivers.map((d: Record<string, unknown>) => d.id as string);
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, plate, make, model, year, segment, assigned_driver_id')
    .in('assigned_driver_id', driverIds)
    .eq('segment', booking.segment)
    .eq('is_active', true);

  const vehicleMap = new Map(
    (vehicles ?? []).map((v: Record<string, unknown>) => [v.assigned_driver_id as string, v]),
  );

  // 4. Merge and only return drivers that have a matching vehicle
  return drivers
    .filter((d: Record<string, unknown>) => vehicleMap.has(d.id as string))
    .map((d: Record<string, unknown>) => ({
      ...d,
      user_profiles: profileMap.get(d.user_id as string) ?? null,
      vehicles: [vehicleMap.get(d.id as string)].filter(Boolean),
    }));
}
