import { Driver, DriverAvailabilityStatus } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';
import { pool } from '../../shared/db/pg.client';

export async function findDriversByOperator(operator_id: string): Promise<Driver[]> {
  // 1. Fetch drivers
  const { rows: drivers } = await pool.query(
    `SELECT * FROM drivers WHERE operator_id = $1 AND is_active = true ORDER BY created_at DESC`,
    [operator_id],
  );
  if (drivers.length === 0) return [];

  const driverIds = drivers.map((d: Record<string, unknown>) => d.id as string);
  const userIds = drivers.map((d: Record<string, unknown>) => d.user_id as string);

  // 2. Fetch user_profiles and primary assignments in parallel
  const [profilesRes, assignmentsRes] = await Promise.all([
    pool.query(`SELECT id, full_name, phone FROM user_profiles WHERE id = ANY($1)`, [userIds]),
    pool.query(
      `SELECT driver_id, vehicle_id FROM driver_vehicle_assignments WHERE driver_id = ANY($1) AND is_primary = true`,
      [driverIds],
    ),
  ]);
  const profiles = profilesRes.rows;
  const assignments = assignmentsRes.rows;

  // 3. Fetch the vehicles referenced by those assignments
  const vehicleIds = assignments.map((a: { vehicle_id: string }) => a.vehicle_id);
  const vehicles = vehicleIds.length > 0
    ? (await pool.query(
        `SELECT id, plate, make, model, segment, is_active, year, color FROM vehicles WHERE id = ANY($1)`,
        [vehicleIds],
      )).rows
    : [];

  const profileMap = new Map(
    profiles.map((p: { id: string; full_name: string; phone: string | null }) => [p.id, p]),
  );
  const assignmentMap = new Map(
    assignments.map((a: { driver_id: string; vehicle_id: string }) => [a.driver_id, a.vehicle_id]),
  );
  const vehicleMap = new Map(
    vehicles.map((v: { id: string }) => [v.id, v]),
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
  const { rows } = await pool.query(
    `SELECT * FROM drivers WHERE id = $1 AND operator_id = $2`,
    [id, operator_id],
  );
  return rows[0] ?? null;
}

// Platform-wide lookup — no operator filter (platform_admin / superadmin only)
export async function findDriverByIdGlobal(id: string): Promise<Driver | null> {
  const { rows } = await pool.query(`SELECT * FROM drivers WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Platform-wide list — no operator filter (platform_admin / superadmin only)
export async function findAllDrivers(): Promise<Driver[]> {
  const { rows: drivers } = await pool.query(
    `SELECT * FROM drivers WHERE is_active = true ORDER BY created_at DESC`,
  );
  if (drivers.length === 0) return [];

  const driverIds = drivers.map((d: Record<string, unknown>) => d.id as string);
  const userIds = drivers.map((d: Record<string, unknown>) => d.user_id as string);

  const [profilesRes, assignmentsRes] = await Promise.all([
    pool.query(`SELECT id, full_name, phone FROM user_profiles WHERE id = ANY($1)`, [userIds]),
    pool.query(
      `SELECT driver_id, vehicle_id FROM driver_vehicle_assignments WHERE driver_id = ANY($1) AND is_primary = true`,
      [driverIds],
    ),
  ]);
  const profiles = profilesRes.rows;
  const assignments = assignmentsRes.rows;

  const vehicleIds = assignments.map((a: { vehicle_id: string }) => a.vehicle_id);
  const vehicles = vehicleIds.length > 0
    ? (await pool.query(
        `SELECT id, plate, make, model, segment, is_active, year, color FROM vehicles WHERE id = ANY($1)`,
        [vehicleIds],
      )).rows
    : [];

  const profileMap = new Map(
    profiles.map((p: { id: string; full_name: string; phone: string | null }) => [p.id, p]),
  );
  const assignmentMap = new Map(
    assignments.map((a: { driver_id: string; vehicle_id: string }) => [a.driver_id, a.vehicle_id]),
  );
  const vehicleMap = new Map(
    vehicles.map((v: { id: string }) => [v.id, v]),
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
  _req: unknown,
  operator_id: string,
  segment?: string,
): Promise<Driver[]> {
  // Join path: drivers → driver_vehicle_assignments (is_primary=true) → vehicles (is_active=true)
  // Drivers with no primary vehicle assignment are intentionally excluded.
  const segmentFilter = segment ? `AND v.segment = $3` : '';
  const params: unknown[] = [operator_id];
  if (segment) params.push(segment);

  const { rows } = await pool.query(
    `SELECT d.*, v.id AS v_id, v.segment AS v_segment, v.is_active AS v_is_active,
            v.plate AS v_plate, v.make AS v_make, v.model AS v_model
     FROM drivers d
     JOIN driver_vehicle_assignments dva ON dva.driver_id = d.id AND dva.is_primary = true
     JOIN vehicles v ON v.id = dva.vehicle_id AND v.is_active = true
     WHERE d.operator_id = $1
       AND d.availability_status = 'available'
       AND d.is_active = true
       ${segmentFilter}`,
    params,
  );

  return rows.map((d: Record<string, unknown>) => ({
    ...d,
    vehicles: [{ id: d.v_id, segment: d.v_segment, is_active: d.v_is_active, plate: d.v_plate, make: d.v_make, model: d.v_model }],
  })) as unknown as Driver[];
}

export async function findDriverByUserId(user_id: string): Promise<Driver | null> {
  const { rows } = await pool.query(`SELECT * FROM drivers WHERE user_id = $1`, [user_id]);
  return rows[0] ?? null;
}

// Used internally by trips service — no operator_id guard needed (called after auth)
export async function setDriverAvailability(
  driver_id: string,
  status: DriverAvailabilityStatus,
): Promise<void> {
  await pool.query(
    `UPDATE drivers SET availability_status = $1, updated_at = now() WHERE id = $2`,
    [status, driver_id],
  );
}

export async function updateDriverAvailability(
  driver_id: string,
  operator_id: string,
  status: DriverAvailabilityStatus,
): Promise<Driver> {
  const { rows } = await pool.query(
    `UPDATE drivers SET availability_status = $1, updated_at = now()
     WHERE id = $2 AND operator_id = $3 RETURNING *`,
    [status, driver_id, operator_id],
  );
  if (!rows[0]) throw AppError.internal('Failed to update driver');
  return rows[0] as Driver;
}

// Guard helper: returns true if driver has any active trip (assigned or en_route)
export async function hasActiveTrip(driver_id: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM trips WHERE driver_id = $1 AND status = ANY($2)`,
    [driver_id, ['assigned', 'en_route']],
  );
  return parseInt(rows[0].count, 10) > 0;
}

// ─── Self-operator helpers ────────────────────────────────────────────────────

/**
 * Returns the ID of the shared "Independent" self-operator, creating it if it
 * does not yet exist. Used when a driver has no fleet operator assigned.
 */
export async function findOrCreateSelfOperator(): Promise<string> {
  const { rows } = await pool.query(
    `SELECT id FROM operators WHERE slug = 'independent'`,
  );
  if (rows[0]) return rows[0].id as string;

  const { rows: created } = await pool.query(
    `INSERT INTO operators (name, slug, timezone, locale, is_active)
     VALUES ('Independent', 'independent', 'UTC', 'en', true)
     RETURNING id`,
  );
  if (!created[0]) throw AppError.internal('Failed to create self-operator');
  return created[0].id as string;
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
  const { rows } = await pool.query(
    `INSERT INTO drivers
       (user_id, operator_id, availability_status, license_number, license_country, license_expires_at, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.user_id,
      input.operator_id,
      input.availability_status ?? 'available',
      input.license_number,
      input.license_country,
      input.license_expires_at,
      input.is_active ?? true,
    ],
  );
  if (!rows[0]) throw AppError.internal('Failed to create driver record');
  return rows[0] as Driver;
}
