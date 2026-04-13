import { supabase } from '../../shared/db/supabase.client';
import { Driver, DriverAvailabilityStatus } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';

export async function findDriversByOperator(operator_id: string): Promise<Driver[]> {
  // 1. Fetch drivers
  const { data: drivers, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('operator_id', operator_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw AppError.internal(error.message);
  if (!drivers || drivers.length === 0) return [];

  // 2. Fetch matching user_profiles (user_profiles.id = drivers.user_id)
  const userIds = drivers.map((d: Record<string, unknown>) => d.user_id as string);
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, phone')
    .in('id', userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string; phone: string | null }) => [p.id, p]),
  );

  // 3. Merge
  return drivers.map((d: Record<string, unknown>) => ({
    ...d,
    user_profiles: profileMap.get(d.user_id as string) ?? null,
    vehicles: null,
  })) as unknown as Driver[];
}

export async function findDriverById(id: string, operator_id: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', id)
    .eq('operator_id', operator_id)
    .maybeSingle();

  if (error) throw AppError.internal(error.message);
  return data as Driver | null;
}

export async function findDriverByUserId(user_id: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('user_id', user_id)
    .maybeSingle();

  if (error) throw AppError.internal(error.message);
  return data as Driver | null;
}

// Used internally by trips service — no operator_id guard needed (called after auth)
export async function setDriverAvailability(
  driver_id: string,
  status: DriverAvailabilityStatus,
): Promise<void> {
  const { error } = await supabase
    .from('drivers')
    .update({ availability_status: status, updated_at: new Date().toISOString() })
    .eq('id', driver_id);

  if (error) throw AppError.internal(`Failed to update driver availability: ${error.message}`);
}

export async function updateDriverAvailability(
  driver_id: string,
  operator_id: string,
  status: DriverAvailabilityStatus,
): Promise<Driver> {
  const { data, error } = await supabase
    .from('drivers')
    .update({ availability_status: status, updated_at: new Date().toISOString() })
    .eq('id', driver_id)
    .eq('operator_id', operator_id)
    .select()
    .single();

  if (error) throw AppError.internal(`Failed to update driver: ${error.message}`);
  return data as Driver;
}
