-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 006_fix_operator_consistency
-- Purpose  : Ensure ALL entities share the SAME operator_id.
--            Mismatch between vehicles.operator_id and the operator that owns
--            the driver causes vehicles to be invisible in fleet/dispatch.
--
-- Rules:
--   1. Each vehicle in driver_vehicle_assignments must share the driver's
--      operator_id.  If they differ, update vehicles.operator_id to match.
--   2. Each booking's operator_id should match the booking's assigned trip
--      operator.  Trips without an operator are left as-is (pool bookings).
--
-- Safe to re-run: all updates are idempotent (only touches rows that mismatch).
-- Apply via: Supabase SQL editor → Run all.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── DIAGNOSTIC — view before ──────────────────────────────────────────────────
SELECT
  'vehicles'       AS entity,
  v.id             AS entity_id,
  v.operator_id    AS entity_operator,
  d.operator_id    AS driver_operator,
  d.id             AS driver_id
FROM driver_vehicle_assignments dva
JOIN vehicles v ON v.id = dva.vehicle_id
JOIN drivers  d ON d.id = dva.driver_id
WHERE v.operator_id IS DISTINCT FROM d.operator_id;

-- ── FIX 1 — update vehicles to match driver's operator_id ────────────────────
-- When a vehicle is assigned to a driver but they belong to different operators,
-- the vehicle should inherit the driver's operator (the driver was registered
-- first, so their operator is authoritative).
UPDATE vehicles
SET
  operator_id = d.operator_id,
  updated_at  = now()
FROM driver_vehicle_assignments dva
JOIN drivers d ON d.id = dva.driver_id
WHERE vehicles.id = dva.vehicle_id
  AND vehicles.operator_id IS DISTINCT FROM d.operator_id;

-- ── FIX 2 — update bookings to match trip operator (if trip exists) ───────────
-- Only update bookings that have a corresponding trip with a known operator_id.
UPDATE bookings
SET
  operator_id = t.operator_id,
  updated_at  = now()
FROM trips t
WHERE bookings.id = t.booking_id
  AND t.operator_id IS NOT NULL
  AND bookings.operator_id IS DISTINCT FROM t.operator_id;

-- ── FIX 3 — ensure driver_vehicle_assignments.operator_id is consistent ───────
-- The assignments table also carries operator_id. Keep it in sync.
UPDATE driver_vehicle_assignments
SET operator_id = d.operator_id
FROM drivers d
WHERE driver_vehicle_assignments.driver_id = d.id
  AND driver_vehicle_assignments.operator_id IS DISTINCT FROM d.operator_id;

-- ── DIAGNOSTIC — verify fix ───────────────────────────────────────────────────
-- Should return 0 rows after the fixes above.
SELECT
  'REMAINING MISMATCHES: vehicles vs drivers' AS check_name,
  count(*) AS mismatch_count
FROM driver_vehicle_assignments dva
JOIN vehicles v ON v.id = dva.vehicle_id
JOIN drivers  d ON d.id = dva.driver_id
WHERE v.operator_id IS DISTINCT FROM d.operator_id;

SELECT
  'REMAINING MISMATCHES: assignments vs drivers' AS check_name,
  count(*) AS mismatch_count
FROM driver_vehicle_assignments dva
JOIN drivers d ON d.id = dva.driver_id
WHERE dva.operator_id IS DISTINCT FROM d.operator_id;

-- ── SUMMARY — operator entity counts ─────────────────────────────────────────
SELECT
  o.id,
  o.name,
  o.type,
  count(DISTINCT d.id)  AS drivers,
  count(DISTINCT v.id)  AS vehicles,
  count(DISTINCT b.id)  AS bookings
FROM operators o
LEFT JOIN drivers  d ON d.operator_id = o.id
LEFT JOIN vehicles v ON v.operator_id = o.id
LEFT JOIN bookings b ON b.operator_id = o.id
GROUP BY o.id, o.name, o.type
ORDER BY drivers DESC;
