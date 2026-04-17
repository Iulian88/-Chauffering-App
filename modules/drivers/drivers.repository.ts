import { Request } from 'express';
import { supabase, getSupabaseForRequest } from '../../shared/db/supabase.client';
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

  const driverIds = drivers.map((d: Record<string, unknown>) => d.id as string);
  const userIds = drivers.map((d: Record<string, unknown>) => d.user_id as string);

  // 2. Fetch user_profiles and primary assignments in parallel
  const [{ data: profiles }, { data: assignments }] = await Promise.all([
    supabase.from('user_profiles').select('id, full_name, phone').in('id', userIds),
    supabase
      .from('driver_vehicle_assignments')
      .select('driver_id, vehicle_id')
      .in('driver_id', driverIds)
      .eq('is_primary', true),
  ]);

  // 3. Fetch the vehicles referenced by those assignments
  const vehicleIds = (assignments ?? []).map((a: { vehicle_id: string }) => a.vehicle_id);
  const { data: vehicles } = vehicleIds.length > 0
    ? await supabase
        .from('vehicles')
        .select('id, plate, make, model, segment, is_active, year, color')
        .in('id', vehicleIds)
    : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string; phone: string | null }) => [p.id, p]),
  );
  const assignmentMap = new Map(
    (assignments ?? []).map((a: { driver_id: string; vehicle_id: string }) => [a.driver_id, a.vehicle_id]),
  );
  const vehicleMap = new Map(
    (vehicles ?? []).map((v: { id: string }) => [v.id, v]),
  );

  // 4. Merge
  return drivers.map((d: Record<string, unknown>) => {
    const vehicleId = assignmentMap.get(d.id as string);
    const vehicle = vehicleId ? vehicleMap.get(vehicleId) : undefined;
    return {
      ...d,
      user_profiles: profileMap.get(d.user_id as string) ?? null,
      vehicles: vehicle ? [vehicle] : [],
    };
  }) as unknown as Driver[];
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

// Platform-wide lookup — no operator filter (platform_admin / superadmin only)
export async function findDriverByIdGlobal(id: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw AppError.internal(error.message);
  return data as Driver | null;
}

// Platform-wide list — no operator filter (platform_admin / superadmin only)
export async function findAllDrivers(): Promise<Driver[]> {
  const { data: drivers, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw AppError.internal(error.message);
  if (!drivers || drivers.length === 0) return [];

  const driverIds = drivers.map((d: Record<string, unknown>) => d.id as string);
  const userIds = drivers.map((d: Record<string, unknown>) => d.user_id as string);

  const [{ data: profiles }, { data: assignments }] = await Promise.all([
    supabase.from('user_profiles').select('id, full_name, phone').in('id', userIds),
    supabase
      .from('driver_vehicle_assignments')
      .select('driver_id, vehicle_id')
      .in('driver_id', driverIds)
      .eq('is_primary', true),
  ]);

  const vehicleIds = (assignments ?? []).map((a: { vehicle_id: string }) => a.vehicle_id);
  const { data: vehicles } = vehicleIds.length > 0
    ? await supabase
        .from('vehicles')
        .select('id, plate, make, model, segment, is_active, year, color')
        .in('id', vehicleIds)
    : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string; phone: string | null }) => [p.id, p]),
  );
  const assignmentMap = new Map(
    (assignments ?? []).map((a: { driver_id: string; vehicle_id: string }) => [a.driver_id, a.vehicle_id]),
  );
  const vehicleMap = new Map(
    (vehicles ?? []).map((v: { id: string }) => [v.id, v]),
  );

  return drivers.map((d: Record<string, unknown>) => {
    const vehicleId = assignmentMap.get(d.id as string);
    const vehicle = vehicleId ? vehicleMap.get(vehicleId) : undefined;
    return {
      ...d,
      user_profiles: profileMap.get(d.user_id as string) ?? null,
      vehicles: vehicle ? [vehicle] : [],
    };
  }) as unknown as Driver[];
}

export async function findAvailableDriversByOperator(
  req: Request,
  operator_id: string,
  segment?: string,
): Promise<Driver[]> {
  const db = getSupabaseForRequest(req);
  // MIGRATED: using driver_vehicle_assignments instead of assigned_driver_id
  // Join path: drivers → driver_vehicle_assignments (is_primary=true) → vehicles (is_active=true)
  // Drivers with no primary vehicle assignment are intentionally excluded.
  const { data, error } = await db
    .from('drivers')
    .select(`
      *,
      driver_vehicle_assignments!inner(
        is_primary,
        vehicles!inner(id, segment, is_active, plate, make, model)
      )
    `)
    .eq('operator_id', operator_id)
    .eq('availability_status', 'available')
    .eq('is_active', true)
    .eq('driver_vehicle_assignments.is_primary', true)
    .eq('driver_vehicle_assignments.vehicles.is_active', true);

  if (error) throw AppError.internal(error.message);

  type RawDriver = Driver & {
    driver_vehicle_assignments: {
      is_primary: boolean;
      vehicles: { id: string; segment: string; is_active: boolean; plate: string; make: string; model: string };
    }[];
  };

  let drivers = (data ?? []) as unknown as RawDriver[];

  if (segment) {
    drivers = drivers.filter(d =>
      (d.driver_vehicle_assignments ?? []).some(
        a => a.vehicles.is_active && a.vehicles.segment === segment,
      ),
    );
  }

  // Normalise: expose vehicles[] on the driver object for callers that use it
  return drivers.map(d => ({
    ...d,
    vehicles: d.driver_vehicle_assignments.map(a => a.vehicles),
  })) as unknown as Driver[];
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

// Guard helper: returns true if driver has any active trip (assigned or en_route)
export async function hasActiveTrip(driver_id: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('trips')
    .select('id', { count: 'exact', head: true })
    .eq('driver_id', driver_id)
    .in('status', ['assigned', 'en_route']);

  if (error) throw AppError.internal(error.message);
  return (count ?? 0) > 0;
}

// ─── Self-operator helpers ────────────────────────────────────────────────────

/**
 * Returns the ID of the shared "Independent" self-operator, creating it if it
 * does not yet exist. Used when a driver has no fleet operator assigned.
 */
export async function findOrCreateSelfOperator(): Promise<string> {
  const { data: existing } = await supabase
    .from('operators')
    .select('id')
    .eq('slug', 'independent')
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from('operators')
    .insert({
      name: 'Independent',
      slug: 'independent',
      timezone: 'UTC',
      locale: 'en',
      is_active: true,
    })
    .select('id')
    .single();

  if (error) throw AppError.internal(`Failed to create self-operator: ${error.message}`);
  return (created as { id: string }).id;
}

export interface CreateDriverInput {
  user_id: string;
  operator_id?: string | null;
  availability_status?: string;
  license_number: string;
  license_country: string;
  license_expires_at: string; // ISO date string e.g. "2028-06-30"
  is_active?: boolean;
}

export async function createDriverRecord(input: CreateDriverInput & { operator_id: string }): Promise<Driver> {
  const { data, error } = await supabase
    .from('drivers')
    .insert({
      user_id: input.user_id,
      operator_id: input.operator_id,
      availability_status: input.availability_status ?? 'available',
      license_number: input.license_number,
      license_country: input.license_country,
      license_expires_at: input.license_expires_at,
      is_active: input.is_active ?? true,
    })
    .select()
    .single();

  if (error) throw AppError.internal(error.message);
  return data as Driver;
}
