-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 003_seed_dispatch_test
-- Purpose  : Seed a minimal Driver → Vehicle → Assignment → Booking chain
--            so DispatchModal has something to show and /assignments returns data.
-- Apply via: Supabase SQL editor → run all
-- Safe to re-run: creates only what is missing, never duplicates.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_operator_id   UUID;
  v_driver_id     UUID;
  v_user_id       UUID;
  v_vehicle_id    UUID;
  v_assignment_id UUID;
  v_booking_id    UUID;
BEGIN

  -- ─────────────────────────────────────────────────────────────────────────
  -- STEP 0: pick the first active operator
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_operator_id
  FROM operators
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'No active operator found. Create an operator first.';
  END IF;

  RAISE NOTICE 'Operator: %', v_operator_id;

  -- ─────────────────────────────────────────────────────────────────────────
  -- STEP 1: ensure an active, available driver exists for this operator
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT d.id, d.user_id INTO v_driver_id, v_user_id
  FROM drivers d
  WHERE d.operator_id = v_operator_id
    AND d.is_active = true
  ORDER BY d.created_at ASC
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    -- Find any user_profile linked to this operator to attach the test driver
    SELECT id INTO v_user_id
    FROM user_profiles
    WHERE operator_id = v_operator_id AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    -- Fallback: any superadmin / platform_admin user
    IF v_user_id IS NULL THEN
      SELECT id INTO v_user_id
      FROM user_profiles
      WHERE role IN ('superadmin', 'platform_admin')
      LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'No user_profiles found to attach a test driver. Seed a user first.';
    END IF;

    INSERT INTO drivers (
      user_id, operator_id, availability_status,
      license_number, license_country, license_expires_at,
      is_active, created_at, updated_at
    ) VALUES (
      v_user_id, v_operator_id, 'available',
      'TEST-DL-001', 'RO', (now() + INTERVAL '2 years')::date,
      true, now(), now()
    )
    RETURNING id INTO v_driver_id;

    RAISE NOTICE 'Created test driver: %', v_driver_id;
  ELSE
    -- Make sure the driver is available so dispatch can find them
    UPDATE drivers
    SET availability_status = 'available', updated_at = now()
    WHERE id = v_driver_id;

    RAISE NOTICE 'Using existing driver: %  (set to available)', v_driver_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- STEP 2: ensure an active executive vehicle exists for this operator
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_vehicle_id
  FROM vehicles
  WHERE operator_id = v_operator_id
    AND segment = 'executive'
    AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_vehicle_id IS NULL THEN
    INSERT INTO vehicles (
      operator_id, segment, plate, make, model, year, color,
      is_active, created_at, updated_at
    ) VALUES (
      v_operator_id, 'executive', 'TEST-EXE-001', 'Mercedes-Benz', 'E 220 CDI',
      2023, 'Negru', true, now(), now()
    )
    RETURNING id INTO v_vehicle_id;

    RAISE NOTICE 'Created test vehicle: %', v_vehicle_id;
  ELSE
    RAISE NOTICE 'Using existing executive vehicle: %', v_vehicle_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- STEP 3: ensure a primary assignment links this driver ↔ vehicle
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT id INTO v_assignment_id
  FROM driver_vehicle_assignments
  WHERE driver_id  = v_driver_id
    AND vehicle_id = v_vehicle_id
    AND is_primary = true;

  IF v_assignment_id IS NULL THEN
    -- Demote any other primary assignment this driver currently holds
    UPDATE driver_vehicle_assignments
    SET is_primary = false
    WHERE driver_id = v_driver_id
      AND is_primary = true;

    INSERT INTO driver_vehicle_assignments (
      driver_id, vehicle_id, operator_id, is_primary
    ) VALUES (
      v_driver_id, v_vehicle_id, v_operator_id, true
    )
    RETURNING id INTO v_assignment_id;

    RAISE NOTICE 'Created assignment: %', v_assignment_id;
  ELSE
    RAISE NOTICE 'Assignment already exists: %', v_assignment_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- STEP 4: create a test booking (executive, confirmed, ready for dispatch)
  -- ─────────────────────────────────────────────────────────────────────────
  INSERT INTO bookings (
    operator_id,
    client_user_id,
    pricing_rule_id,
    status,
    dispatch_status,
    segment,
    pickup_address,  pickup_lat,  pickup_lng,
    dropoff_address, dropoff_lat, dropoff_lng,
    stops,
    scheduled_at,
    price_estimate,
    price_final,
    currency,
    distance_km,
    duration_sec,
    pricing_snapshot,
    channel,
    partner,
    client_price,
    driver_price,
    profit,
    created_at,
    updated_at
  ) VALUES (
    v_operator_id,
    v_user_id,                          -- client_user_id: reuse driver's user
    NULL,                               -- pricing_rule_id: none for seed
    'confirmed',
    'ready',
    'executive',
    'Piața Unirii 1, București',  44.4268,  26.1025,
    'Aeroportul Henri Coandă, Otopeni',  44.5722, 26.1020,
    NULL,
    now() + INTERVAL '2 hours',
    150.00,
    NULL,
    'RON',
    25.0,
    1800,
    '{"rule_id":"default","base_fare":30,"per_km_rate":4.8,"per_min_rate":0.5,"minimum_fare":30,"surge_multiplier":1,"currency":"RON"}'::jsonb,
    'seed',
    '',
    NULL,
    NULL,
    NULL,
    now(),
    now()
  )
  RETURNING id INTO v_booking_id;

  RAISE NOTICE 'Created booking: %', v_booking_id;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Summary
  -- ─────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE '  SEED COMPLETE';
  RAISE NOTICE '  operator_id   : %', v_operator_id;
  RAISE NOTICE '  driver_id     : %', v_driver_id;
  RAISE NOTICE '  vehicle_id    : %', v_vehicle_id;
  RAISE NOTICE '  assignment_id : %', v_assignment_id;
  RAISE NOTICE '  booking_id    : %', v_booking_id;
  RAISE NOTICE '══════════════════════════════════════';

END;
$$;
