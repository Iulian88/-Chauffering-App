import { pool } from '../../shared/db/pg.client';
import { Booking, BookingStatus, DispatchStatus } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';

export async function createBooking(
  data: Omit<Booking, 'id' | 'created_at' | 'updated_at' | 'price_final' | 'cancelled_by' | 'cancelled_at' | 'cancellation_reason'>,
): Promise<Booking> {
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `INSERT INTO bookings (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    vals,
  );
  if (!rows[0]) throw AppError.internal('Failed to create booking');
  return rows[0] as Booking;
}

export async function findBookingById(
  id: string,
  operator_id: string,
): Promise<Booking | null> {
  const { rows } = await pool.query(
    `SELECT * FROM bookings WHERE id = $1 AND operator_id = $2`,
    [id, operator_id],
  );
  return rows[0] ?? null;
}

export async function findBookingByIdForClient(id: string, client_user_id: string): Promise<Booking | null> {
  const { rows } = await pool.query(
    `SELECT * FROM bookings WHERE id = $1 AND client_user_id = $2`,
    [id, client_user_id],
  );
  return rows[0] ?? null;
}

export async function findBookingByIdGlobal(id: string): Promise<Booking | null> {
  const { rows } = await pool.query(`SELECT * FROM bookings WHERE id = $1`, [id]);
  return rows[0] ?? null;
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
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  // Pool mode: only unassigned bookings
  if (filter.pool) {
    conditions.push(`operator_id IS NULL`);
  } else if (filter.operator_id) {
    conditions.push(`operator_id = $${idx++}`);
    params.push(filter.operator_id);
  }

  if (filter.status) { conditions.push(`status = $${idx++}`); params.push(filter.status); }
  if (filter.segment) { conditions.push(`segment = $${idx++}`); params.push(filter.segment); }
  if (filter.from) { conditions.push(`scheduled_at >= $${idx++}`); params.push(filter.from); }
  if (filter.to) { conditions.push(`scheduled_at <= $${idx++}`); params.push(filter.to); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let sql = `SELECT * FROM bookings ${where} ORDER BY scheduled_at ASC`;
  if (filter.limit) { sql += ` LIMIT $${idx++}`; params.push(filter.limit); }
  if (filter.offset) { sql += ` OFFSET $${idx++}`; params.push(filter.offset); }

  const { rows } = await pool.query(sql, params);
  return rows as Booking[];
}

export async function updateBookingStatus(
  id: string,
  operator_id: string,
  status: BookingStatus,
  extra?: Partial<Booking>,
): Promise<Booking> {
  const extra_cols = extra ? Object.keys(extra) : [];
  const extra_vals = extra ? Object.values(extra) : [];
  const setClauses = [`status = $1`, `updated_at = now()`, ...extra_cols.map((c, i) => `${c} = $${i + 3}`)];
  const { rows } = await pool.query(
    `UPDATE bookings SET ${setClauses.join(', ')} WHERE id = $2 AND operator_id = $${extra_cols.length + 3} RETURNING *`,
    [status, id, ...extra_vals, operator_id],
  );
  if (!rows[0]) throw AppError.internal('Failed to update booking');
  return rows[0] as Booking;
}

// Global update — no operator_id filter (used for pool bookings or platform_admin actions)
export async function updateBookingStatusGlobal(
  id: string,
  status: BookingStatus,
  extra?: Partial<Booking>,
): Promise<Booking> {
  const extra_cols = extra ? Object.keys(extra) : [];
  const extra_vals = extra ? Object.values(extra) : [];
  const setClauses = [`status = $1`, `updated_at = now()`, ...extra_cols.map((c, i) => `${c} = $${i + 3}`)];
  const { rows } = await pool.query(
    `UPDATE bookings SET ${setClauses.join(', ')} WHERE id = $2 RETURNING *`,
    [status, id, ...extra_vals],
  );
  if (!rows[0]) throw AppError.internal('Failed to update booking');
  return rows[0] as Booking;
}

// Assign an operator to a pool booking — only succeeds if currently unassigned
export async function assignOperator(id: string, operator_id: string): Promise<Booking> {
  const { rows } = await pool.query(
    `UPDATE bookings SET operator_id = $1, updated_at = now()
     WHERE id = $2 AND operator_id IS NULL RETURNING *`,
    [operator_id, id],
  );
  if (!rows[0]) throw AppError.conflict('Booking already has an operator assigned', 'ALREADY_ASSIGNED');
  return rows[0] as Booking;
}

// Update dispatch_status only — does not touch booking.status
export async function setDispatchStatus(
  bookingId: string,
  status: DispatchStatus,
): Promise<void> {
  await pool.query(
    `UPDATE bookings SET dispatch_status = $1, updated_at = now() WHERE id = $2`,
    [status, bookingId],
  );
}
