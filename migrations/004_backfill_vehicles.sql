-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 004_backfill_vehicles
-- Purpose  : Backfill placeholder vehicle rows for every vehicle_id referenced
--            in driver_vehicle_assignments that has no matching row in vehicles.
--
-- Why this exists:
--   supabase/migrations/002_seed_drivers_vehicles.sql inserted vehicles with
--   an `assigned_driver_id` column that no longer exists in the current schema.
--   That insert failed silently, leaving vehicles empty while assignments held
--   dangling vehicle_id FKs.
--
-- Apply via: Supabase SQL editor → Run all
-- Safe to re-run: ON CONFLICT (id) DO NOTHING guards against duplicates.
-- Does NOT touch existing vehicles rows.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_before  INT;
  v_after   INT;
  v_created INT := 0;
  v_orphans INT;
  v_has_assigned_driver_id BOOLEAN;
BEGIN

  -- ── Count before ──────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_before FROM vehicles;
  RAISE NOTICE '────────────────────────────────────────';
  RAISE NOTICE 'Vehicles BEFORE backfill : %', v_before;

  -- ── Detect schema variant ─────────────────────────────────────────────────
  -- Some deployments still have the legacy assigned_driver_id column.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'vehicles'
      AND column_name  = 'assigned_driver_id'
  ) INTO v_has_assigned_driver_id;

  RAISE NOTICE 'vehicles.assigned_driver_id column exists: %', v_has_assigned_driver_id;

  -- ── Backfill ──────────────────────────────────────────────────────────────
  -- For every vehicle_id in driver_vehicle_assignments with no vehicles row,
  -- insert a placeholder record using data from the assignment.
  -- DISTINCT ON vehicle_id picks one assignment per vehicle (primary preferred).

  IF v_has_assigned_driver_id THEN
    -- Legacy schema: include assigned_driver_id
    EXECUTE $dyn$
      INSERT INTO vehicles (
        id, operator_id, assigned_driver_id,
        segment, plate, make, model, year,
        is_active, created_at, updated_at
      )
      SELECT DISTINCT ON (dva.vehicle_id)
        dva.vehicle_id,
        dva.operator_id,
        dva.driver_id,
        COALESCE(
          (SELECT v2.segment FROM vehicles v2 WHERE v2.id = dva.vehicle_id LIMIT 1),
          'executive'
        ),
        'BKF-' || UPPER(LEFT(dva.vehicle_id::TEXT, 8)),
        'Unknown',
        'Vehicle',
        2020,
        true,
        now(),
        now()
      FROM driver_vehicle_assignments dva
      WHERE NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.id = dva.vehicle_id)
      ORDER BY dva.vehicle_id, dva.is_primary DESC NULLS LAST
      ON CONFLICT (id) DO NOTHING
    $dyn$;
  ELSE
    -- Current schema: no assigned_driver_id column
    INSERT INTO vehicles (
      id, operator_id,
      segment, plate, make, model, year,
      is_active, created_at, updated_at
    )
    SELECT DISTINCT ON (dva.vehicle_id)
      dva.vehicle_id,
      dva.operator_id,
      'executive',
      'BKF-' || UPPER(LEFT(dva.vehicle_id::TEXT, 8)),
      'Unknown',
      'Vehicle',
      2020,
      true,
      now(),
      now()
    FROM driver_vehicle_assignments dva
    WHERE NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.id = dva.vehicle_id)
    ORDER BY dva.vehicle_id, dva.is_primary DESC NULLS LAST
    ON CONFLICT (id) DO NOTHING;
  END IF;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  -- ── Count after ───────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_after FROM vehicles;
  RAISE NOTICE 'Vehicles created         : %', v_created;
  RAISE NOTICE 'Vehicles AFTER backfill  : %', v_after;

  -- ── Integrity check ───────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_orphans
  FROM driver_vehicle_assignments dva
  WHERE NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.id = dva.vehicle_id);

  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Integrity check FAILED: % orphan assignment(s) still reference missing vehicles', v_orphans;
  END IF;

  RAISE NOTICE '────────────────────────────────────────';
  RAISE NOTICE 'Integrity check PASSED — 0 orphan assignments';
  RAISE NOTICE '════════════════════════════════════════';

END;
$$;

-- ── Verify: show final vehicle list ──────────────────────────────────────────
SELECT
  v.id,
  v.operator_id,
  v.segment,
  v.plate,
  v.make,
  v.model,
  v.year,
  v.is_active,
  CASE WHEN dva.vehicle_id IS NOT NULL THEN '✓ assigned' ELSE '— unassigned' END AS assignment_status
FROM vehicles v
LEFT JOIN driver_vehicle_assignments dva
  ON dva.vehicle_id = v.id AND dva.is_primary = true
ORDER BY v.created_at DESC;
