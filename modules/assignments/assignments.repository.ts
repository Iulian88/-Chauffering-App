import { pool } from '../../shared/db/pg.client';

export interface Assignment {
  id: string;
  driver_id: string;
  vehicle_id: string;
  operator_id: string;
  is_primary: boolean;
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
  // Step 1: fetch assignments
  const { rows } = operator_id
    ? await pool.query(
        `SELECT id, driver_id, vehicle_id, operator_id, is_primary
         FROM driver_vehicle_assignments WHERE operator_id = $1 ORDER BY id DESC`,
        [operator_id],
      )
    : await pool.query(
        `SELECT id, driver_id, vehicle_id, operator_id, is_primary
         FROM driver_vehicle_assignments ORDER BY id DESC`,
      );

  if (!rows || rows.length === 0) return [];

  const assignments = rows as Assignment[];

  // Step 2: fetch drivers + vehicles in parallel
  const driverIds = [...new Set(assignments.map((a) => a.driver_id))];
  const vehicleIds = [...new Set(assignments.map((a) => a.vehicle_id))];

  const [{ rows: drivers }, { rows: vehicles }] = await Promise.all([
    pool.query(
      `SELECT id, license_number, user_id FROM drivers WHERE id = ANY($1)`,
      [driverIds],
    ),
    pool.query(
      `SELECT id, plate, make, model, segment, is_active FROM vehicles WHERE id = ANY($1)`,
      [vehicleIds],
    ),
  ]);

  // Step 3: fetch user_profiles for those drivers
  const userIds = [...new Set(drivers.map((d: Record<string, unknown>) => d.user_id as string).filter(Boolean))];
  const { rows: profiles } = userIds.length > 0
    ? await pool.query(`SELECT id, full_name, phone FROM user_profiles WHERE id = ANY($1)`, [userIds])
    : { rows: [] };

  // Build lookup maps
  const profileMap = new Map(
    profiles.map((p: { id: string; full_name: string; phone: string | null }) => [p.id, p]),
  );
  const driverMap = new Map(
    drivers.map((d: Record<string, unknown>) => [
      d.id as string,
      {
        id: d.id as string,
        license_number: d.license_number as string,
        user_profiles: profileMap.get(d.user_id as string) ?? null,
      },
    ]),
  );
  const vehicleMap = new Map(
    vehicles.map((v: Record<string, unknown>) => [v.id as string, v]),
  );

  // Step 4: merge
  return assignments.map((a) => ({
    ...a,
    driver: driverMap.get(a.driver_id) ?? null,
    vehicle: (vehicleMap.get(a.vehicle_id) ?? null) as AssignmentWithDetails['vehicle'],
  }));
}

export async function findAssignmentById(id: string): Promise<Assignment | null> {
  const { rows } = await pool.query(
    `SELECT * FROM driver_vehicle_assignments WHERE id = $1`,
    [id],
  );
  return (rows[0] as Assignment) ?? null;
}

export async function findPrimaryAssignmentForDriver(driver_id: string): Promise<Assignment | null> {
  const { rows } = await pool.query(
    `SELECT * FROM driver_vehicle_assignments WHERE driver_id = $1 AND is_primary = true LIMIT 1`,
    [driver_id],
  );
  return (rows[0] as Assignment) ?? null;
}

export async function createAssignment(input: {
  driver_id: string;
  vehicle_id: string;
  operator_id: string;
  is_primary: boolean;
}): Promise<Assignment> {
  const { rows } = await pool.query(
    `INSERT INTO driver_vehicle_assignments (driver_id, vehicle_id, operator_id, is_primary)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.driver_id, input.vehicle_id, input.operator_id, input.is_primary],
  );
  if (!rows[0]) throw new Error('Failed to create assignment');
  return rows[0] as Assignment;
}

export async function demoteExistingPrimary(driver_id: string): Promise<void> {
  // Unset is_primary for any existing primary assignment for this driver
  await pool.query(
    `UPDATE driver_vehicle_assignments SET is_primary = false WHERE driver_id = $1 AND is_primary = true`,
    [driver_id],
  );
}

export async function setPrimaryAssignment(id: string, driver_id: string): Promise<Assignment | null> {
  // Demote all others for this driver first
  await pool.query(
    `UPDATE driver_vehicle_assignments SET is_primary = false WHERE driver_id = $1 AND is_primary = true AND id != $2`,
    [driver_id, id],
  );

  // Set this one as primary
  const { rows } = await pool.query(
    `UPDATE driver_vehicle_assignments SET is_primary = true WHERE id = $1 RETURNING *`,
    [id],
  );
  return (rows[0] as Assignment) ?? null;
}

export async function softDeleteAssignment(id: string): Promise<void> {
  await pool.query(`DELETE FROM driver_vehicle_assignments WHERE id = $1`, [id]);
}
