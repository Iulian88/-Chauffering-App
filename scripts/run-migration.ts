import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const schema = `
-- ============================================================
-- MULTI-TENANT CHAUFFEUR PLATFORM — DATABASE SCHEMA
-- ============================================================


-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'platform_admin',
    'operator_admin',
    'dispatcher',
    'driver',
    'client'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM (
    'pending',
    'confirmed',
    'dispatched',
    'in_progress',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE client_source_type AS ENUM (
    'operator',
    'driver',
    'platform'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- OPERATORS
-- ============================================================

CREATE TABLE IF NOT EXISTS operators (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255)  NOT NULL,
  slug        VARCHAR(100)  NOT NULL UNIQUE,
  active      BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uid   UUID          NOT NULL UNIQUE,
  email          VARCHAR(255)  NOT NULL UNIQUE,
  full_name      VARCHAR(255),
  role           user_role     NOT NULL DEFAULT 'dispatcher',
  operator_id    UUID          REFERENCES operators(id) ON DELETE SET NULL,
  active         BOOLEAN       NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_supabase_uid  ON users(supabase_uid);
CREATE INDEX IF NOT EXISTS idx_users_operator_id   ON users(operator_id);


-- ============================================================
-- DRIVERS
-- ============================================================

CREATE TABLE IF NOT EXISTS drivers (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          REFERENCES users(id) ON DELETE SET NULL,
  operator_id  UUID          REFERENCES operators(id) ON DELETE SET NULL,
  full_name    VARCHAR(255)  NOT NULL,
  phone        VARCHAR(50),
  email        VARCHAR(255),
  active       BOOLEAN       NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drivers_operator_id  ON drivers(operator_id);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id      ON drivers(user_id);


-- ============================================================
-- CLIENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
  id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_operator_id   UUID                REFERENCES operators(id) ON DELETE SET NULL,
  source_type         client_source_type  NOT NULL DEFAULT 'operator',
  source_driver_id    UUID                REFERENCES drivers(id) ON DELETE SET NULL,
  full_name           VARCHAR(255)        NOT NULL,
  phone               VARCHAR(50),
  email               VARCHAR(255),
  notes               TEXT,
  active              BOOLEAN             NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),

  CONSTRAINT chk_driver_source
    CHECK (
      source_type != 'driver' OR source_driver_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_clients_owner_operator_id  ON clients(owner_operator_id);
CREATE INDEX IF NOT EXISTS idx_clients_source_driver_id   ON clients(source_driver_id);


-- ============================================================
-- BOOKINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS bookings (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),

  operator_id           UUID            NOT NULL REFERENCES operators(id),
  client_id             UUID            NOT NULL REFERENCES clients(id),
  driver_id             UUID            REFERENCES drivers(id) ON DELETE SET NULL,
  created_by_user_id    UUID            REFERENCES users(id) ON DELETE SET NULL,

  status                booking_status  NOT NULL DEFAULT 'pending',

  pickup_address        TEXT            NOT NULL,
  pickup_lat            NUMERIC(10, 7),
  pickup_lng            NUMERIC(10, 7),
  pickup_notes          TEXT,

  dropoff_address       TEXT            NOT NULL,
  dropoff_lat           NUMERIC(10, 7),
  dropoff_lng           NUMERIC(10, 7),
  dropoff_notes         TEXT,

  scheduled_at          TIMESTAMPTZ     NOT NULL,

  distance_km           NUMERIC(8, 2),
  duration_sec          INTEGER,

  client_price          NUMERIC(10, 2),
  driver_price          NUMERIC(10, 2),

  channel               VARCHAR(100),
  partner               VARCHAR(100),

  created_at            TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_operator_id        ON bookings(operator_id);
CREATE INDEX IF NOT EXISTS idx_bookings_client_id          ON bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_driver_id          ON bookings(driver_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status             ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at       ON bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_operator_status    ON bookings(operator_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_operator_scheduled ON bookings(operator_id, scheduled_at);


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_operators_updated_at
    BEFORE UPDATE ON operators
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_drivers_updated_at
    BEFORE UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

async function runMigration(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('Running migration...');
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
    console.log('Migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed — rolled back');
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
