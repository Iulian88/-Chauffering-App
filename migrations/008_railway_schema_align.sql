-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 008_railway_schema_align
-- Purpose  : Bring Railway Postgres schema into alignment with TypeScript
--            domain types. Run once on a near-empty Railway database.
-- Safe to re-run: all changes use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Extend enums (must be outside a transaction block in PG < 12)
--    These are idempotent — pg will no-op if value already exists.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superadmin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'operator_dispatcher';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. operators — rename active → is_active, add timezone/locale/type
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operators' AND column_name = 'active'
  ) THEN
    ALTER TABLE operators RENAME COLUMN active TO is_active;
  END IF;
END $$;

ALTER TABLE operators ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE operators ADD COLUMN IF NOT EXISTS locale   TEXT NOT NULL DEFAULT 'en';
ALTER TABLE operators ADD COLUMN IF NOT EXISTS type     TEXT NOT NULL DEFAULT 'fleet'
  CHECK (type IN ('fleet', 'self'));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. users — add phone column (used by user_profiles-style queries)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. drivers — rename active → is_active, add dispatch/license columns
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'active'
  ) THEN
    ALTER TABLE drivers RENAME COLUMN active TO is_active;
  END IF;
END $$;

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'offline'
  CHECK (availability_status IN ('available', 'busy', 'offline'));
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_number   TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_country  TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_expires_at DATE;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. bookings — rename client_id → client_user_id; add missing columns
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE bookings RENAME COLUMN client_id TO client_user_id;
  END IF;
END $$;

-- operator_id can be NULL for pool bookings
ALTER TABLE bookings ALTER COLUMN operator_id DROP NOT NULL;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pricing_rule_id  UUID;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS segment          TEXT NOT NULL DEFAULT 'executive'
  CHECK (segment IN ('ride', 'business', 'executive', 'office_lux', 'prime_lux'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dispatch_status  TEXT NOT NULL DEFAULT 'pending'
  CHECK (dispatch_status IN ('pending', 'ready', 'dispatching', 'assigned', 'failed'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_estimate   NUMERIC(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_final      NUMERIC(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency         TEXT NOT NULL DEFAULT 'RON';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stops            JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by     UUID;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS profit           NUMERIC(10,2);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. vehicles
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL,
  segment     TEXT NOT NULL CHECK (segment IN ('ride', 'business', 'executive', 'office_lux', 'prime_lux')),
  plate       TEXT NOT NULL,
  make        TEXT NOT NULL,
  model       TEXT NOT NULL,
  year        INTEGER NOT NULL,
  color       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plate)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. driver_vehicle_assignments
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_vehicle_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID NOT NULL REFERENCES drivers(id)  ON DELETE CASCADE,
  vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL,
  is_primary  BOOLEAN NOT NULL DEFAULT false
);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. trips
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL,
  driver_id      UUID NOT NULL REFERENCES drivers(id),
  vehicle_id     UUID NOT NULL REFERENCES vehicles(id),
  operator_id    UUID NOT NULL,
  status         TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'accepted', 'en_route', 'arrived', 'completed', 'refused', 'cancelled')),
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at    TIMESTAMPTZ,
  en_route_at    TIMESTAMPTZ,
  arrived_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  refused_at     TIMESTAMPTZ,
  refusal_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. dispatch_log
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID,
  booking_id  UUID NOT NULL,
  driver_id   UUID NOT NULL,
  assigned_by UUID,
  action      TEXT NOT NULL,
  outcome     TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 10. pricing_rules
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id      UUID NOT NULL,
  segment          TEXT NOT NULL,
  base_fare        NUMERIC(10,2)  NOT NULL DEFAULT 0,
  per_km_rate      NUMERIC(10,4)  NOT NULL DEFAULT 0,
  per_min_rate     NUMERIC(10,4)  NOT NULL DEFAULT 0,
  minimum_fare     NUMERIC(10,2)  NOT NULL DEFAULT 0,
  surge_multiplier NUMERIC(5,2)   NOT NULL DEFAULT 1,
  currency         TEXT           NOT NULL DEFAULT 'RON',
  is_active        BOOLEAN        NOT NULL DEFAULT true,
  valid_from       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  valid_until      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 11. user_profiles VIEW  (backward-compat alias over users table)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW user_profiles AS
  SELECT
    id,
    operator_id,
    full_name,
    phone,
    role::TEXT AS role,
    active     AS is_active,
    created_at,
    updated_at
  FROM users;
