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
  if (!user.operator_id) throw AppError.forbidden('No operator scope');

  const { data: trip, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .eq('operator_id', user.operator_id)
    .single();

  if (error || !trip) throw AppError.notFound('Trip');

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

  // Return booking to confirmed
  await supabase
    .from('bookings')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', trip.booking_id)
    .eq('operator_id', user.operator_id);

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
  if (!user.operator_id) throw AppError.forbidden('No operator scope');

  const booking = await findBookingById(bookingId, user.operator_id);
  if (!booking) throw AppError.notFound('Booking');

  // Find available drivers with a vehicle matching the booking segment
  const { data, error } = await supabase
    .from('drivers')
    .select(`
      id,
      user_id,
      availability_status,
      user_profiles!inner(full_name, phone),
      vehicles!inner(id, plate, make, model, segment)
    `)
    .eq('operator_id', user.operator_id)
    .eq('is_active', true)
    .eq('availability_status', 'available')
    .eq('vehicles.segment', booking.segment)
    .eq('vehicles.is_active', true);

  if (error) throw AppError.internal(error.message);
  return data ?? [];
}
