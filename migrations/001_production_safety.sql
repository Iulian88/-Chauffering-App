-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 001_production_safety
-- Apply via: Supabase SQL editor → run all, or psql < migrations/001_production_safety.sql
-- Safe to re-run (all statements are idempotent via IF NOT EXISTS / DO-guards).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Unique primary assignment per driver ───────────────────────────────────
-- Prevents a driver from ever having two rows with is_primary = true.
-- Partial index (only where is_primary = true) keeps the index tiny.
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_primary_assignment
  ON driver_vehicle_assignments (driver_id)
  WHERE is_primary = true;

-- ── 2. Vehicles: segment NOT NULL + is_active default true ───────────────────
-- IMPORTANT: Before enabling the NOT NULL constraint, verify no rows have a
-- NULL segment.  Run first:
--   SELECT id, plate FROM vehicles WHERE segment IS NULL;
-- If any rows exist, fix them:
--   UPDATE vehicles SET segment = 'ride' WHERE segment IS NULL;
ALTER TABLE vehicles
  ALTER COLUMN is_active SET DEFAULT true;

-- Uncomment after confirming zero NULL-segment vehicles:
-- ALTER TABLE vehicles ALTER COLUMN segment SET NOT NULL;

-- ── 3. Drivers: availability_status CHECK constraint ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_driver_availability_status'
      AND conrelid = 'drivers'::regclass
  ) THEN
    ALTER TABLE drivers
      ADD CONSTRAINT chk_driver_availability_status
        CHECK (availability_status IN ('available', 'busy', 'offline'));
  END IF;
END $$;

-- ── 4. Bookings: dispatch_status column ──────────────────────────────────────
-- Tracks the lifecycle of the dispatch pipeline separately from booking status.
-- Values: pending → ready → dispatching → assigned | failed
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS dispatch_status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_booking_dispatch_status
      CHECK (dispatch_status IN ('pending', 'ready', 'dispatching', 'assigned', 'failed'));

-- ── 5. dispatch_failures table ───────────────────────────────────────────────
-- Append-only log of every failed dispatch attempt.
CREATE TABLE IF NOT EXISTS dispatch_failures (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_failures_booking_id
  ON dispatch_failures (booking_id);

CREATE INDEX IF NOT EXISTS idx_dispatch_failures_created_at
  ON dispatch_failures (created_at DESC);

-- ── 6. Atomic dispatch lock (assign_driver_atomic) ───────────────────────────
-- Uses SELECT FOR UPDATE to serialize concurrent assignment attempts on the same
-- driver row.  All mutations happen inside one implicit PL/pgSQL transaction so
-- the trip insert, driver-busy update and booking-status update are atomic.
--
-- Returns a single row: (trip_id UUID, success BOOLEAN, error_code TEXT)
-- Caller checks success=false and inspects error_code instead of catching exceptions.
CREATE OR REPLACE FUNCTION assign_driver_atomic(
  p_driver_id   UUID,
  p_booking_id  UUID,
  p_vehicle_id  UUID,
  p_operator_id UUID,
  p_assigned_by UUID
)
RETURNS TABLE(
  trip_id    UUID,
  success    BOOLEAN,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trip_id          UUID;
  v_availability     TEXT;
  v_existing_trip_id UUID;
BEGIN
  -- Lock the driver row to serialize concurrent dispatch attempts.
  -- Any concurrent call to this function for the same driver_id will wait
  -- here until the first transaction commits or rolls back.
  SELECT availability_status
    INTO v_availability
    FROM drivers
   WHERE id = p_driver_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, false, 'DRIVER_NOT_FOUND';
    RETURN;
  END IF;

  IF v_availability <> 'available' THEN
    RETURN QUERY SELECT NULL::UUID, false, 'DRIVER_ALREADY_ASSIGNED';
    RETURN;
  END IF;

  -- Defense-in-depth: check for any existing active trip regardless of status field
  SELECT id INTO v_existing_trip_id
    FROM trips
   WHERE driver_id = p_driver_id
     AND status IN ('assigned', 'accepted', 'en_route', 'arrived')
   LIMIT 1;

  IF v_existing_trip_id IS NOT NULL THEN
    RETURN QUERY SELECT NULL::UUID, false, 'DRIVER_ALREADY_ASSIGNED';
    RETURN;
  END IF;

  -- Create the trip record
  INSERT INTO trips (
    booking_id, driver_id, vehicle_id, operator_id,
    status, assigned_at, created_at, updated_at
  ) VALUES (
    p_booking_id, p_driver_id, p_vehicle_id, p_operator_id,
    'assigned', now(), now(), now()
  )
  RETURNING id INTO v_trip_id;

  -- Mark driver busy (atomic with trip insert — same transaction)
  UPDATE drivers
     SET availability_status = 'busy',
         updated_at           = now()
   WHERE id = p_driver_id;

  -- Advance booking (both status columns updated atomically)
  UPDATE bookings
     SET status          = 'dispatched',
         dispatch_status = 'assigned',
         updated_at      = now()
   WHERE id = p_booking_id;

  RETURN QUERY SELECT v_trip_id, true, NULL::TEXT;
END;
$$;

-- Allow service_role (used by the backend) to call this function
GRANT EXECUTE ON FUNCTION assign_driver_atomic TO service_role;
