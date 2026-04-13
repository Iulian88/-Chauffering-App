-- =============================================================================
-- Migration: 001_add_missing_columns
-- Adds all columns required by the backend codebase to existing tables.
-- Safe to run multiple times — uses ADD COLUMN IF NOT EXISTS throughout.
-- Source of truth: shared/types/domain.ts + repositories + Zod schemas
-- =============================================================================


-- ─── user_profiles ────────────────────────────────────────────────────────────
-- Code reads: id, role, operator_id, full_name, phone, is_active
-- CRITICAL: is_active missing → auth.middleware blocks every login with 403

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS full_name  TEXT        NOT NULL DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone      TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Patch the existing seeded user so it has a name and is active
UPDATE user_profiles SET
  full_name  = COALESCE(NULLIF(full_name, ''), 'Admin'),
  is_active  = true,
  updated_at = now()
WHERE full_name = '' OR is_active IS NULL;


-- ─── operators ────────────────────────────────────────────────────────────────
-- Code reads/writes: id, name, slug, timezone, locale, is_active, updated_at

ALTER TABLE operators ADD COLUMN IF NOT EXISTS slug       TEXT        NOT NULL DEFAULT '';
ALTER TABLE operators ADD COLUMN IF NOT EXISTS timezone   TEXT        NOT NULL DEFAULT 'UTC';
ALTER TABLE operators ADD COLUMN IF NOT EXISTS locale     TEXT        NOT NULL DEFAULT 'en';
ALTER TABLE operators ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Patch the existing seeded operator
UPDATE operators SET
  slug      = COALESCE(NULLIF(slug, ''), lower(regexp_replace(name, '[^a-zA-Z0-9]', '-', 'g'))),
  timezone  = COALESCE(NULLIF(timezone, ''), 'UTC'),
  locale    = COALESCE(NULLIF(locale, ''), 'en'),
  is_active = true,
  updated_at = now()
WHERE slug = '';


-- ─── bookings ─────────────────────────────────────────────────────────────────
-- Code reads/writes full Booking interface from domain.ts
-- Table has: id, operator_id, status   (confirmed by probe)

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_user_id     UUID           NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pricing_rule_id    UUID;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS segment            TEXT           NOT NULL DEFAULT 'ride';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_address     TEXT           NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_lat         NUMERIC(10,7)  NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_lng         NUMERIC(10,7)  NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_address    TEXT           NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_lat        NUMERIC(10,7)  NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_lng        NUMERIC(10,7)  NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stops              JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS scheduled_at       TIMESTAMPTZ    NOT NULL DEFAULT now();
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_estimate     NUMERIC(10,2)  NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_final        NUMERIC(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency           TEXT           NOT NULL DEFAULT 'RON';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS distance_km        NUMERIC(10,3)  NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duration_sec       INTEGER        NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pricing_snapshot   JSONB          NOT NULL DEFAULT '{}';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by       UUID;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ    NOT NULL DEFAULT now();
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ    NOT NULL DEFAULT now();


-- ─── trips ────────────────────────────────────────────────────────────────────
-- Table has: id, booking_id, driver_id, vehicle_id, status   (confirmed by probe)
-- Code writes: operator_id, assigned_at, and 6 nullable timestamp/text columns

ALTER TABLE trips ADD COLUMN IF NOT EXISTS operator_id    UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE trips ADD COLUMN IF NOT EXISTS accepted_at    TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS en_route_at    TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS arrived_at     TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS refused_at     TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS refusal_reason TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE trips ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();


-- ─── drivers ──────────────────────────────────────────────────────────────────
-- Table has: id, user_id   (confirmed by probe — all other columns missing)
-- Code queries: operator_id, availability_status, is_active, license_*

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS operator_id        UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS availability_status TEXT        NOT NULL DEFAULT 'available';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_number      TEXT        NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_country     TEXT        NOT NULL DEFAULT '';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_expires_at  DATE        NOT NULL DEFAULT '2099-12-31';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_active           BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT now();


-- ─── vehicles ─────────────────────────────────────────────────────────────────
-- Table has: id, operator_id, plate, model, created_at   (per probe — make/segment/year missing)

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS assigned_driver_id UUID;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS segment            TEXT        NOT NULL DEFAULT 'ride';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS make               TEXT        NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS year               INTEGER     NOT NULL DEFAULT 2020;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS color              TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_active          BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now();


-- ─── pricing_rules ────────────────────────────────────────────────────────────
-- Table has: id, operator_id   (all rate/config columns missing)
-- pricing.repository.ts also queries valid_from / valid_until for time-bound rules

ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS segment          TEXT           NOT NULL DEFAULT 'ride';
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS base_fare        NUMERIC(10,2)  NOT NULL DEFAULT 0;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS per_km_rate      NUMERIC(10,4)  NOT NULL DEFAULT 0;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS per_min_rate     NUMERIC(10,4)  NOT NULL DEFAULT 0;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS minimum_fare     NUMERIC(10,2)  NOT NULL DEFAULT 0;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(4,2)   NOT NULL DEFAULT 1.00;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS currency         TEXT           NOT NULL DEFAULT 'RON';
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS is_active        BOOLEAN        NOT NULL DEFAULT true;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS valid_from       TIMESTAMPTZ    NOT NULL DEFAULT now();
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS valid_until      TIMESTAMPTZ;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ    NOT NULL DEFAULT now();
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now();


-- ─── dispatch_log ─────────────────────────────────────────────────────────────
-- Full structure from DispatchLog interface in domain.ts
-- trips.repository.ts insertDispatchLog writes: trip_id, booking_id, driver_id,
--   assigned_by, action, outcome (optional), note (optional)

ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS trip_id     UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS booking_id  UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS driver_id   UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS assigned_by UUID;
ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS action      TEXT        NOT NULL DEFAULT '';
ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS outcome     TEXT;
ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS note        TEXT;
ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now();


-- ─── notifications_log ────────────────────────────────────────────────────────
-- Columns written by notifications.service.ts sendNotification()

ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS user_id       UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS operator_id   UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS channel       TEXT        NOT NULL DEFAULT 'push';
ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS template_key  TEXT        NOT NULL DEFAULT '';
ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS title         TEXT        NOT NULL DEFAULT '';
ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS body          TEXT        NOT NULL DEFAULT '';
ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS payload       JSONB;
ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS status        TEXT        NOT NULL DEFAULT 'pending';
ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS sent_at       TIMESTAMPTZ;
ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT now();
