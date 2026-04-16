import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../shared/db/supabase.client';
import { Booking, BookingStatus } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';

export async function createBooking(
  data: Omit<Booking, 'id' | 'created_at' | 'updated_at' | 'price_final' | 'cancelled_by' | 'cancelled_at' | 'cancellation_reason'>,
): Promise<Booking> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert(data)
    .select()
    .single();

  if (error) throw AppError.internal(`Failed to create booking: ${error.message}`);
  return booking as Booking;
}

export async function findBookingById(
  id: string,
  operator_id: string,
  db: SupabaseClient = supabase,
): Promise<Booking | null> {
  const { data, error } = await db
    .from('bookings')
    .select('*')
    .eq('id', id)
    .eq('operator_id', operator_id)
    .maybeSingle();

  if (error) throw AppError.internal(error.message);
  return data as Booking | null;
}

export async function findBookingByIdForClient(id: string, client_user_id: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .eq('client_user_id', client_user_id)
    .maybeSingle();

  if (error) throw AppError.internal(error.message);
  return data as Booking | null;
}

export async function findBookingByIdGlobal(id: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw AppError.internal(error.message);
  return data as Booking | null;
}

export interface ListBookingsFilter {
  operator_id?: string | null;
  pool?: boolean;            // when true, filter operator_id IS NULL
  status?: BookingStatus;
  segment?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listBookings(filter: ListBookingsFilter): Promise<Booking[]> {
  let query = supabase
    .from('bookings')
    .select('*')
    .order('scheduled_at', { ascending: true });

  // Pool mode: only unassigned bookings
  if (filter.pool) {
    query = query.is('operator_id', null);
  } else if (filter.operator_id) {
    // Scoped to a specific operator
    query = query.eq('operator_id', filter.operator_id);
  }

  if (filter.status) query = query.eq('status', filter.status);
  if (filter.segment) query = query.eq('segment', filter.segment);
  if (filter.from) query = query.gte('scheduled_at', filter.from);
  if (filter.to) query = query.lte('scheduled_at', filter.to);
  if (filter.limit) query = query.limit(filter.limit);
  if (filter.offset) query = query.range(filter.offset, filter.offset + (filter.limit ?? 50) - 1);

  const { data, error } = await query;
  if (error) throw AppError.internal(error.message);
  return (data ?? []) as Booking[];
}

export async function updateBookingStatus(
  id: string,
  operator_id: string,
  status: BookingStatus,
  extra?: Partial<Booking>,
): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id)
    .eq('operator_id', operator_id)
    .select()
    .single();

  if (error) throw AppError.internal(`Failed to update booking: ${error.message}`);
  return data as Booking;
}

// Global update — no operator_id filter (used for pool bookings or platform_admin actions)
export async function updateBookingStatusGlobal(
  id: string,
  status: BookingStatus,
  extra?: Partial<Booking>,
): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id)
    .select()
    .single();

  if (error) throw AppError.internal(`Failed to update booking: ${error.message}`);
  return data as Booking;
}

// Assign an operator to a pool booking — only succeeds if currently unassigned
export async function assignOperator(id: string, operator_id: string): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ operator_id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('operator_id', null)
    .select()
    .single();

  if (error) throw AppError.internal(`Failed to assign operator: ${error.message}`);
  if (!data) throw AppError.conflict('Booking already has an operator assigned', 'ALREADY_ASSIGNED');
  return data as Booking;
}
