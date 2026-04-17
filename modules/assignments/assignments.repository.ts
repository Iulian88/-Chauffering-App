import { supabase } from '../../shared/db/supabase.client';

export interface Assignment {
  id: string;
  driver_id: string;
  vehicle_id: string;
  operator_id: string;
  is_primary: boolean;
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
  // Step 1: fetch assignments (no nested joins — avoids FK schema cache issues)
  let query = supabase
    .from('driver_vehicle_assignments')
    .select('id, driver_id, vehicle_id, operator_id, is_primary, unassigned_at')
    .is('unassigned_at', null)
    .order('id', { ascending: false });

  if (operator_id) {
    query = query.eq('operator_id', operator_id);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const assignments = rows as Assignment[];

  // Step 2: fetch drivers + vehicles in parallel
  const driverIds = [...new Set(assignments.map((a) => a.driver_id))];
  const vehicleIds = [...new Set(assignments.map((a) => a.vehicle_id))];

  const [{ data: drivers }, { data: vehicles }] = await Promise.all([
    supabase
      .from('drivers')
      .select('id, license_number, user_id')
      .in('id', driverIds),
    supabase
      .from('vehicles')
      .select('id, plate, make, model, segment, is_active')
      .in('id', vehicleIds),
  ]);

  // Step 3: fetch user_profiles for those drivers
  const userIds = [...new Set((drivers ?? []).map((d: Record<string, unknown>) => d.user_id as string).filter(Boolean))];
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('user_profiles').select('id, full_name, phone').in('id', userIds)
    : { data: [] };

  // Build lookup maps
  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string; phone: string | null }) => [p.id, p]),
  );
  const driverMap = new Map(
    (drivers ?? []).map((d: Record<string, unknown>) => [
      d.id as string,
      {
        id: d.id as string,
        license_number: d.license_number as string,
        user_profiles: profileMap.get(d.user_id as string) ?? null,
      },
    ]),
  );
  const vehicleMap = new Map(
    (vehicles ?? []).map((v: Record<string, unknown>) => [v.id as string, v]),
  );

  // Step 4: merge
  return assignments.map((a) => ({
    ...a,
    driver: driverMap.get(a.driver_id) ?? null,
    vehicle: (vehicleMap.get(a.vehicle_id) ?? null) as AssignmentWithDetails['vehicle'],
  }));
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
