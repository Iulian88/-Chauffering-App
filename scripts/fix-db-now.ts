import { Pool } from 'pg';
import 'dotenv/config';

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:AHXuAgLTjXmplqfwrzUEJtcTozdLoRxU@mainline.proxy.rlwy.net:11505/railway';

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('Connected to Railway Postgres');

    // --- Check current bookings columns ---
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings' ORDER BY ordinal_position`
    );
    console.log('Current bookings columns:', cols.map((r: any) => r.column_name).join(', '));

    // --- Check segments table ---
    const { rows: segCheck } = await client.query(`SELECT to_regclass('public.segments') AS tbl`);
    console.log('segments table exists:', segCheck[0].tbl);

    // --- Add missing columns idempotently ---
    const alterStatements = [
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS profit NUMERIC(10,2)`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pricing_rule_id UUID`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS segment TEXT NOT NULL DEFAULT 'executive'`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dispatch_status TEXT NOT NULL DEFAULT 'pending'`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_estimate NUMERIC(10,2)`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_final NUMERIC(10,2)`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RON'`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stops JSONB`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by UUID`,
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`,
    ];

    for (const sql of alterStatements) {
      await client.query(sql);
      console.log('OK:', sql.substring(0, 60));
    }

    // --- Create segments table ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS segments (
        name        TEXT PRIMARY KEY,
        label       TEXT NOT NULL,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        sort_order  INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    console.log('OK: CREATE TABLE IF NOT EXISTS segments');

    await client.query(`
      INSERT INTO segments (name, label, sort_order) VALUES
        ('ride',        'Standard Ride',   1),
        ('business',    'Business Class',  2),
        ('executive',   'Executive',       3),
        ('office_lux',  'Office Luxury',   4),
        ('prime_lux',   'Prime Luxury',    5)
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('OK: segments seeded');

    // --- Verify final state ---
    const { rows: finalCols } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings' ORDER BY ordinal_position`
    );
    console.log('\nFinal bookings columns:', finalCols.map((r: any) => r.column_name).join(', '));

    const { rows: segRows } = await client.query(`SELECT name FROM segments ORDER BY sort_order`);
    console.log('Segments:', segRows.map((r: any) => r.name).join(', '));

    console.log('\n=== ALL DONE ===');
  } finally {
    client.release();
    await pool.end();
  }
})();
