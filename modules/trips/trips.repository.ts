import { pool } from '../../shared/db/pg.client';
import { Trip, TripStatus } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';

export async function findTripsByOperator(operator_id: string): Promise<Trip[]> {
  const { rows } = await pool.query(
    `SELECT * FROM trips WHERE operator_id = $1 ORDER BY assigned_at DESC`,
    [operator_id],
  );
  return rows as Trip[];
}

// Platform-wide list — no operator filter (platform_admin / superadmin only)
export async function findAllTrips(): Promise<Trip[]> {
  const { rows } = await pool.query(`SELECT * FROM trips ORDER BY assigned_at DESC`);
  return rows as Trip[];
}

export async function insertTrip(
  data: Omit<Trip, 'id' | 'created_at' | 'updated_at' | 'assigned_at' | 'accepted_at' | 'en_route_at' | 'arrived_at' | 'completed_at' | 'refused_at' | 'refusal_reason'>,
): Promise<Trip> {
  const cols = [...Object.keys(data), 'assigned_at'];
  const vals = [...Object.values(data), new Date().toISOString()];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `INSERT INTO trips (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    vals,
  );
  if (!rows[0]) throw AppError.internal('Failed to create trip');
  return rows[0] as Trip;
}

export async function findTripById(id: string, operator_id: string): Promise<Trip | null> {
  const { rows } = await pool.query(
    `SELECT * FROM trips WHERE id = $1 AND operator_id = $2`,
    [id, operator_id],
  );
  return rows[0] ?? null;
}

// Platform-wide lookup — no operator filter (platform_admin / superadmin only)
export async function findTripByIdGlobal(id: string): Promise<Trip | null> {
  const { rows } = await pool.query(`SELECT * FROM trips WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findTripByIdForDriver(id: string, driver_id: string): Promise<Trip | null> {
  const { rows } = await pool.query(
    `SELECT * FROM trips WHERE id = $1 AND driver_id = $2`,
    [id, driver_id],
  );
  return rows[0] ?? null;
}

export async function findActiveTripForBooking(booking_id: string): Promise<Trip | null> {
  const { rows } = await pool.query(
    `SELECT * FROM trips WHERE booking_id = $1 AND status NOT IN ('refused', 'cancelled') LIMIT 1`,
    [booking_id],
  );
  return rows[0] ?? null;
}

export async function updateTripStatus(
  id: string,
  status: TripStatus,
  extra?: Record<string, unknown>,
): Promise<Trip> {
  const extra_cols = extra ? Object.keys(extra) : [];
  const extra_vals = extra ? Object.values(extra) : [];
  const setClauses = [`status = $1`, `updated_at = now()`, ...extra_cols.map((c, i) => `${c} = $${i + 3}`)];
  const { rows } = await pool.query(
    `UPDATE trips SET ${setClauses.join(', ')} WHERE id = $2 RETURNING *`,
    [status, id, ...extra_vals],
  );
  if (!rows[0]) throw AppError.internal('Failed to update trip');
  return rows[0] as Trip;
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
  try {
    await pool.query(
      `INSERT INTO dispatch_log (trip_id, booking_id, driver_id, assigned_by, action, outcome, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entry.trip_id, entry.booking_id, entry.driver_id, entry.assigned_by, entry.action, entry.outcome ?? null, entry.note ?? null],
    );
  } catch (err) {
    console.error('[dispatch_log insert failed]', (err as Error).message);
    // non-fatal — audit log failure should not break the main flow
  }
}
