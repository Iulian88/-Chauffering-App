-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 009_marketplace_schema
-- Purpose  : Extend schema to support a 3-sided marketplace:
--              - Clients post ride requests visible to operators
--              - Operators accept requests and assign drivers
--              - Self-employed drivers see a public job board
--              - Drivers can affiliate with multiple operators
--              - Clients can mark favourite drivers
-- Apply via: Supabase SQL editor → run all
-- Safe to re-run: all statements are idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. drivers.operator_id → nullable
--    Self-employed drivers have no fleet operator (operator_id = NULL).
--    They still appear in driver_operator_affiliations if affiliated.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE drivers ALTER COLUMN operator_id DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Extend bookings.status enum to cover marketplace lifecycle
--    New statuses:
--      pending_operator  → client submitted request; awaiting operator accept
--      accepted_operator → operator accepted; assigning driver
--      pending_driver    → on self-employed job board; awaiting driver claim
--
--    ADD VALUE IF NOT EXISTS is idempotent in Postgres 9.1+.
--    Must run OUTSIDE a transaction block (Railway executes each statement
--    separately so this is fine).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'pending_operator';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'accepted_operator';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'pending_driver';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. New columns on bookings
--    accepted_by_operator_id  → which operator claimed this marketplace request
--    offer_expires_at         → deadline for operators to accept (NULL = no deadline)
--    marketplace_visible      → true = visible to operators/job board
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS accepted_by_operator_id UUID
    REFERENCES operators(id) ON DELETE SET NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS marketplace_visible BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_marketplace
  ON bookings (status, marketplace_visible, segment)
  WHERE marketplace_visible = true;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. driver_operator_affiliations
--    Allows a driver (fleet or self-employed) to be affiliated with
--    one or more operators.  commission_pct = platform cut (0-100).
--    status: pending → awaiting operator approval
--            active  → approved and working
--            suspended → temporarily blocked
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_operator_affiliations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id      UUID        NOT NULL REFERENCES drivers(id)   ON DELETE CASCADE,
  operator_id    UUID        NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'suspended')),
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00
                   CHECK (commission_pct >= 0 AND commission_pct <= 100),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, operator_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliations_operator
  ON driver_operator_affiliations (operator_id, status);

CREATE INDEX IF NOT EXISTS idx_affiliations_driver
  ON driver_operator_affiliations (driver_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. client_favorite_drivers
--    A client can mark any driver as a favourite.
--    NOTE: client_user_id is UUID without FK — user_profiles is a view on
--    Railway, not a base table, so it cannot be referenced.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_favorite_drivers (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id UUID        NOT NULL,
  driver_id      UUID        NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_user_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_client
  ON client_favorite_drivers (client_user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_driver
  ON client_favorite_drivers (driver_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Verify
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  'driver_operator_affiliations' AS tbl,
  to_regclass('public.driver_operator_affiliations') IS NOT NULL AS exists
UNION ALL
SELECT
  'client_favorite_drivers',
  to_regclass('public.client_favorite_drivers') IS NOT NULL
UNION ALL
SELECT
  'bookings.marketplace_visible',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'marketplace_visible'
  )
UNION ALL
SELECT
  'drivers.operator_id nullable',
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers'
      AND column_name = 'operator_id'
      AND is_nullable = 'NO'
  );
