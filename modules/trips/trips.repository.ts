import { supabase } from '../../shared/db/supabase.client';
import { Trip, TripStatus } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';

export async function findTripsByOperator(operator_id: string): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('operator_id', operator_id)
    .order('assigned_at', { ascending: false });

  if (error) throw AppError.internal(error.message);
  return (data ?? []) as Trip[];
}

// Platform-wide list — no operator filter (platform_admin / superadmin only)
export async function findAllTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .order('assigned_at', { ascending: false });

  if (error) throw AppError.internal(error.message);
  return (data ?? []) as Trip[];
}

export async function insertTrip(
  data: Omit<Trip, 'id' | 'created_at' | 'updated_at' | 'assigned_at' | 'accepted_at' | 'en_route_at' | 'arrived_at' | 'completed_at' | 'refused_at' | 'refusal_reason'>,
): Promise<Trip> {
  const { data: trip, error } = await supabase
    .from('trips')
    .insert({ ...data, assigned_at: new Date().toISOString() })
    .select()
    .single();

  if (error) throw AppError.internal(`Failed to create trip: ${error.message}`);
  return trip as Trip;
}

export async function findTripById(id: string, operator_id: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', id)
    .eq('operator_id', operator_id)
    .maybeSingle();

  if (error) throw AppError.internal(error.message);
  return data as Trip | null;
}

// Platform-wide lookup — no operator filter (platform_admin / superadmin only)
export async function findTripByIdGlobal(id: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw AppError.internal(error.message);
  return data as Trip | null;
}

export async function findTripByIdForDriver(id: string, driver_id: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', id)
    .eq('driver_id', driver_id)
    .maybeSingle();

  if (error) throw AppError.internal(error.message);
  return data as Trip | null;
}

export async function findActiveTripForBooking(booking_id: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('booking_id', booking_id)
    .not('status', 'in', '("refused","cancelled")')
    .maybeSingle();

  if (error) throw AppError.internal(error.message);
  return data as Trip | null;
}

export async function updateTripStatus(
  id: string,
  status: TripStatus,
  extra?: Record<string, unknown>,
): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id)
    .select()
    .single();

  if (error) throw AppError.internal(`Failed to update trip: ${error.message}`);
  return data as Trip;
}

export async function insertDispatchLog(entry: {
  trip_id: string;
  booking_id: string;
  driver_id: string;
  assigned_by: string | null;
  action: string;
  outcome?: string | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('dispatch_log').insert(entry);
  if (error) console.error('[dispatch_log insert failed]', error.message);
  // non-fatal — audit log failure should not break the main flow
}
