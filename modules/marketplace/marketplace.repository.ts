import { pool } from '../../shared/db/pg.client';
import {
  Booking,
  Operator,
  Driver,
  DriverOperatorAffiliation,
  DriverAffiliationStatus,
  ClientFavoriteDriver,
} from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBookingRow(row: Record<string, unknown>): Booking {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...row,
    pickup_lat:     Number(row.pickup_lat),
    pickup_lng:     Number(row.pickup_lng),
    dropoff_lat:    Number(row.dropoff_lat),
    dropoff_lng:    Number(row.dropoff_lng),
    price_estimate: Number(row.price_estimate),
    price_final:    num(row.price_final),
    distance_km:    Number(row.distance_km),
    duration_sec:   Number(row.duration_sec),
    client_price:   num(row.client_price),
    driver_price:   num(row.driver_price),
    profit:         num(row.profit),
  } as Booking;
}

// ─── Operators ────────────────────────────────────────────────────────────────

/**
 * Active operators visible to clients browsing the marketplace.
 * Never exposes internal pricing columns.
 */
export async function findActiveOperators(): Promise<
  Pick<Operator, 'id' | 'name' | 'slug' | 'type' | 'timezone' | 'locale'>[]
> {
  const { rows } = await pool.query(
    `SELECT id, name, slug, type, timezone, locale
     FROM operators
     WHERE is_active = true
     ORDER BY name ASC`,
  );
  return rows as Pick<Operator, 'id' | 'name' | 'slug' | 'type' | 'timezone' | 'locale'>[];
}

// ─── Marketplace Requests (pending_operator pool) ─────────────────────────────

/**
 * Bookings posted to the operator marketplace that haven't been accepted yet.
 * Optional filter by segment.
 */
export async function findPendingOperatorBookings(
  segment?: string,
): Promise<Booking[]> {
  const conditions: string[] = [
    `status = 'pending_operator'`,
    `marketplace_visible = true`,
  ];
  const values: unknown[] = [];

  if (segment) {
    values.push(segment);
    conditions.push(`segment = $${values.length}`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM bookings WHERE ${conditions.join(' AND ')} ORDER BY scheduled_at ASC`,
    values,
  );
  return rows.map(parseBookingRow);
}

/**
 * Operator atomically claims a pending_operator booking.
 * Returns the updated booking, or null if the booking was already taken
 * (race condition handled at DB level — no TOCTOU gap).
 */
export async function acceptMarketplaceRequest(
  booking_id: string,
  operator_id: string,
): Promise<Booking | null> {
  const { rows } = await pool.query(
    `UPDATE bookings
     SET status                  = 'accepted_operator',
         accepted_by_operator_id = $2,
         operator_id             = $2,
         marketplace_visible     = false,
         updated_at              = now()
     WHERE id = $1
       AND status = 'pending_operator'
     RETURNING *`,
    [booking_id, operator_id],
  );
  return rows[0] ? parseBookingRow(rows[0]) : null;
}

// ─── Job Board (pending_driver pool) ─────────────────────────────────────────

/**
 * Bookings on the self-employed driver job board.
 * Optional filter by segment.
 * Drivers see driver_price only (client_price/profit filtered at service level).
 */
export async function findPendingDriverJobs(
  segment?: string,
): Promise<Booking[]> {
  const conditions: string[] = [
    `status = 'pending_driver'`,
    `marketplace_visible = true`,
  ];
  const values: unknown[] = [];

  if (segment) {
    values.push(segment);
    conditions.push(`segment = $${values.length}`);
  }

  // Intentionally exclude client_price and profit — drivers must not see those
  const { rows } = await pool.query(
    `SELECT id, operator_id, segment, status, dispatch_status,
            pickup_address, pickup_lat, pickup_lng,
            dropoff_address, dropoff_lat, dropoff_lng,
            stops, scheduled_at, price_estimate, currency,
            distance_km, duration_sec, driver_price,
            offer_expires_at, marketplace_visible, created_at, updated_at
     FROM bookings
     WHERE ${conditions.join(' AND ')}
     ORDER BY scheduled_at ASC`,
    values,
  );

  return rows.map(r => ({
    ...r,
    pickup_lat:     Number(r.pickup_lat),
    pickup_lng:     Number(r.pickup_lng),
    dropoff_lat:    Number(r.dropoff_lat),
    dropoff_lng:    Number(r.dropoff_lng),
    price_estimate: Number(r.price_estimate),
    price_final:    null,
    distance_km:    Number(r.distance_km),
    duration_sec:   Number(r.duration_sec),
    client_price:   null,     // hidden from driver
    driver_price:   r.driver_price === null ? null : Number(r.driver_price),
    profit:         null,     // hidden from driver
  } as Booking));
}

/**
 * Driver's primary assigned vehicle (needed to create a trip on claim).
 */
export async function findPrimaryVehicleForDriver(
  driver_id: string,
): Promise<{ vehicle_id: string; operator_id: string } | null> {
  const { rows } = await pool.query(
    `SELECT dva.vehicle_id, dva.operator_id
     FROM driver_vehicle_assignments dva
     WHERE dva.driver_id = $1
       AND dva.is_primary = true
     LIMIT 1`,
    [driver_id],
  );
  return rows[0] ?? null;
}

/**
 * Atomically claim a pending_driver job and insert a trip in the same transaction.
 * Returns { booking, trip } on success, or null if booking already taken.
 */
export async function claimDriverJob(params: {
  booking_id: string;
  driver_id: string;
  vehicle_id: string;
  operator_id: string | null;
}): Promise<{ booking: Booking; trip_id: string } | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomic claim — fails silently if already taken
    const { rows: updated } = await client.query(
      `UPDATE bookings
       SET status              = 'confirmed',
           dispatch_status     = 'assigned',
           marketplace_visible = false,
           updated_at          = now()
       WHERE id = $1
         AND status = 'pending_driver'
         AND (offer_expires_at IS NULL OR offer_expires_at > now())
       RETURNING *`,
      [params.booking_id],
    );

    if (!updated[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const booking = parseBookingRow(updated[0]);

    // Create trip linked to this booking + driver
    const { rows: tripRows } = await client.query(
      `INSERT INTO trips (booking_id, driver_id, vehicle_id, operator_id, status, assigned_at)
       VALUES ($1, $2, $3, $4, 'assigned', now())
       RETURNING id`,
      [params.booking_id, params.driver_id, params.vehicle_id, params.operator_id],
    );

    if (!tripRows[0]) {
      await client.query('ROLLBACK');
      throw AppError.internal('Failed to create trip on claim');
    }

    await client.query('COMMIT');
    return { booking, trip_id: tripRows[0].id as string };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Affiliations ─────────────────────────────────────────────────────────────

export async function findAffiliationsByDriver(
  driver_id: string,
): Promise<DriverOperatorAffiliation[]> {
  const { rows } = await pool.query(
    `SELECT a.*, o.name AS operator_name
     FROM driver_operator_affiliations a
     JOIN operators o ON o.id = a.operator_id
     WHERE a.driver_id = $1
     ORDER BY a.created_at DESC`,
    [driver_id],
  );
  return rows as DriverOperatorAffiliation[];
}

export async function findAffiliationsByOperator(
  operator_id: string,
): Promise<(DriverOperatorAffiliation & { driver_license: string | null })[]> {
  const { rows } = await pool.query(
    `SELECT a.*, d.license_number AS driver_license, d.availability_status
     FROM driver_operator_affiliations a
     JOIN drivers d ON d.id = a.driver_id
     WHERE a.operator_id = $1
     ORDER BY a.status ASC, a.created_at DESC`,
    [operator_id],
  );
  return rows as (DriverOperatorAffiliation & { driver_license: string | null })[];
}

export async function findAllAffiliations(): Promise<
  (DriverOperatorAffiliation & { driver_license: string | null; operator_name: string | null })[]
> {
  const { rows } = await pool.query(
    `SELECT a.*,
            d.license_number AS driver_license,
            d.availability_status,
            o.name            AS operator_name
     FROM driver_operator_affiliations a
     JOIN drivers   d ON d.id = a.driver_id
     JOIN operators o ON o.id = a.operator_id
     ORDER BY a.status ASC, a.created_at DESC`,
  );
  return rows as (DriverOperatorAffiliation & { driver_license: string | null; operator_name: string | null })[];
}

/**
 * Request affiliation — driver asks to affiliate with an operator.
 * Idempotent: if already exists (any status), returns existing row.
 */
export async function requestAffiliation(
  driver_id: string,
  operator_id: string,
  note: string | null,
): Promise<DriverOperatorAffiliation> {
  const { rows } = await pool.query(
    `INSERT INTO driver_operator_affiliations (driver_id, operator_id, note)
     VALUES ($1, $2, $3)
     ON CONFLICT (driver_id, operator_id) DO UPDATE
       SET note       = EXCLUDED.note,
           updated_at = now()
     RETURNING *`,
    [driver_id, operator_id, note],
  );
  if (!rows[0]) throw AppError.internal('Failed to create affiliation');
  return rows[0] as DriverOperatorAffiliation;
}

export async function findAffiliationById(
  id: string,
): Promise<DriverOperatorAffiliation | null> {
  const { rows } = await pool.query(
    `SELECT * FROM driver_operator_affiliations WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateAffiliationStatus(
  id: string,
  status: DriverAffiliationStatus,
  commission_pct: number | null,
): Promise<DriverOperatorAffiliation> {
  const updates: string[] = ['status = $2', 'updated_at = now()'];
  const values: unknown[] = [id, status];

  if (commission_pct !== null) {
    values.push(commission_pct);
    updates.push(`commission_pct = $${values.length}`);
  }

  const { rows } = await pool.query(
    `UPDATE driver_operator_affiliations
     SET ${updates.join(', ')}
     WHERE id = $1
     RETURNING *`,
    values,
  );
  if (!rows[0]) throw AppError.notFound('Affiliation');
  return rows[0] as DriverOperatorAffiliation;
}

// ─── Favorites ────────────────────────────────────────────────────────────────

export async function findFavoriteDriversForClient(
  client_user_id: string,
): Promise<(ClientFavoriteDriver & Pick<Driver, 'availability_status' | 'license_country'>)[]> {
  const { rows } = await pool.query(
    `SELECT f.*, d.availability_status, d.license_country, d.operator_id
     FROM client_favorite_drivers f
     JOIN drivers d ON d.id = f.driver_id
     WHERE f.client_user_id = $1
     ORDER BY f.created_at DESC`,
    [client_user_id],
  );
  return rows as (ClientFavoriteDriver & Pick<Driver, 'availability_status' | 'license_country'>)[];
}

/**
 * Add a driver to client's favorites (idempotent — UNIQUE constraint).
 */
export async function addFavoriteDriver(
  client_user_id: string,
  driver_id: string,
): Promise<ClientFavoriteDriver> {
  const { rows } = await pool.query(
    `INSERT INTO client_favorite_drivers (client_user_id, driver_id)
     VALUES ($1, $2)
     ON CONFLICT (client_user_id, driver_id) DO UPDATE
       SET created_at = client_favorite_drivers.created_at
     RETURNING *`,
    [client_user_id, driver_id],
  );
  if (!rows[0]) throw AppError.internal('Failed to add favorite');
  return rows[0] as ClientFavoriteDriver;
}

export async function removeFavoriteDriver(
  client_user_id: string,
  driver_id: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM client_favorite_drivers
     WHERE client_user_id = $1 AND driver_id = $2`,
    [client_user_id, driver_id],
  );
  return (rowCount ?? 0) > 0;
}

// ─── Driver lookup (for claim validation) ─────────────────────────────────────

export async function findActiveDriver(
  driver_id: string,
): Promise<Driver | null> {
  const { rows } = await pool.query(
    `SELECT * FROM drivers WHERE id = $1 AND is_active = true`,
    [driver_id],
  );
  return rows[0] ? (rows[0] as Driver) : null;
}
