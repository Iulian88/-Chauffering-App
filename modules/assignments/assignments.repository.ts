import { supabase } from '../../shared/db/supabase.client';

export interface Assignment {
  id: string;
  driver_id: string;
  vehicle_id: string;
  operator_id: string;
  is_primary: boolean;
  assigned_at: string;
  unassigned_at: string | null;
}

export interface AssignmentWithDetails extends Assignment {
  driver: {
    id: string;
    license_number: string;
    user_profiles: { full_name: string; phone: string | null } | null;
  } | null;
  vehicle: {
    id: string;
    plate: string;
    make: string;
    model: string;
    segment: string;
    is_active: boolean;
  } | null;
}

export async function listAssignments(operator_id?: string): Promise<AssignmentWithDetails[]> {
  let query = supabase
    .from('driver_vehicle_assignments')
    .select(`
      id,
      driver_id,
      vehicle_id,
      operator_id,
      is_primary,
      assigned_at,
      unassigned_at,
      driver:drivers!driver_id (
        id,
        license_number,
        user_profiles (
          full_name,
          phone
        )
      ),
      vehicle:vehicles!vehicle_id (
        id,
        plate,
        make,
        model,
        segment,
        is_active
      )
    `)
    .is('unassigned_at', null)
    .order('assigned_at', { ascending: false });

  if (operator_id) {
    query = query.eq('operator_id', operator_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AssignmentWithDetails[];
}

export async function findAssignmentById(id: string): Promise<Assignment | null> {
  const { data, error } = await supabase
    .from('driver_vehicle_assignments')
    .select('*')
    .eq('id', id)
    .is('unassigned_at', null)
    .single();

  if (error) return null;
  return data as Assignment;
}

export async function findPrimaryAssignmentForDriver(driver_id: string): Promise<Assignment | null> {
  const { data, error } = await supabase
    .from('driver_vehicle_assignments')
    .select('*')
    .eq('driver_id', driver_id)
    .eq('is_primary', true)
    .is('unassigned_at', null)
    .maybeSingle();

  if (error) return null;
  return data as Assignment | null;
}

export async function createAssignment(input: {
  driver_id: string;
  vehicle_id: string;
  operator_id: string;
  is_primary: boolean;
}): Promise<Assignment> {
  const { data, error } = await supabase
    .from('driver_vehicle_assignments')
    .insert({
      driver_id: input.driver_id,
      vehicle_id: input.vehicle_id,
      operator_id: input.operator_id,
      is_primary: input.is_primary,
      assigned_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Assignment;
}

export async function demoteExistingPrimary(driver_id: string): Promise<void> {
  // Unset is_primary for any existing primary assignment for this driver
  await supabase
    .from('driver_vehicle_assignments')
    .update({ is_primary: false })
    .eq('driver_id', driver_id)
    .eq('is_primary', true)
    .is('unassigned_at', null);
}

export async function setPrimaryAssignment(id: string, driver_id: string): Promise<Assignment | null> {
  // Demote all others for this driver first
  await supabase
    .from('driver_vehicle_assignments')
    .update({ is_primary: false })
    .eq('driver_id', driver_id)
    .eq('is_primary', true)
    .neq('id', id)
    .is('unassigned_at', null);

  // Set this one as primary
  const { data, error } = await supabase
    .from('driver_vehicle_assignments')
    .update({ is_primary: true })
    .eq('id', id)
    .is('unassigned_at', null)
    .select()
    .single();

  if (error) return null;
  return data as Assignment;
}

export async function softDeleteAssignment(id: string): Promise<void> {
  await supabase
    .from('driver_vehicle_assignments')
    .update({ is_primary: false, unassigned_at: new Date().toISOString() })
    .eq('id', id);
}
