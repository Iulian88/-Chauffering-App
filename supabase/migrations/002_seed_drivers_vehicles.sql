-- =============================================================================
-- Seed: 002_seed_drivers_vehicles
-- Inserts 3 drivers + 3 vehicles for operator ba923bb0-...
-- All drivers: available, is_active = true
-- Vehicles: one per segment (ride, business, executive)
-- UUIDs are hardcoded so this script is idempotent / re-runnable via ON CONFLICT
-- =============================================================================

-- ─── User profiles (no real Supabase Auth login — for dispatch/list testing) ──
INSERT INTO user_profiles (id, email, role, operator_id, full_name, phone, is_active, created_at, updated_at)
VALUES
  (
    'dd000001-0000-0000-0000-000000000001',
    'driver1@chauffeur.test',
    'driver',
    'ba923bb0-8961-4496-b2b1-8febac84f9e8',
    'Alexandru Popescu',
    '+40722100001',
    true,
    now(),
    now()
  ),
  (
    'dd000001-0000-0000-0000-000000000002',
    'driver2@chauffeur.test',
    'driver',
    'ba923bb0-8961-4496-b2b1-8febac84f9e8',
    'Mihai Ionescu',
    '+40722100002',
    true,
    now(),
    now()
  ),
  (
    'dd000001-0000-0000-0000-000000000003',
    'driver3@chauffeur.test',
    'driver',
    'ba923bb0-8961-4496-b2b1-8febac84f9e8',
    'Cristian Dumitru',
    '+40722100003',
    true,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;


-- ─── Drivers ──────────────────────────────────────────────────────────────────
INSERT INTO drivers (
  id,
  user_id,
  operator_id,
  availability_status,
  license_number,
  license_country,
  license_expires_at,
  is_active,
  created_at,
  updated_at
)
VALUES
  (
    'dr000001-0000-0000-0000-000000000001',
    'dd000001-0000-0000-0000-000000000001',
    'ba923bb0-8961-4496-b2b1-8febac84f9e8',
    'available',
    'RO-B-1001234',
    'RO',
    '2028-06-30',
    true,
    now(),
    now()
  ),
  (
    'dr000001-0000-0000-0000-000000000002',
    'dd000001-0000-0000-0000-000000000002',
    'ba923bb0-8961-4496-b2b1-8febac84f9e8',
    'available',
    'RO-B-1005678',
    'RO',
    '2027-12-31',
    true,
    now(),
    now()
  ),
  (
    'dr000001-0000-0000-0000-000000000003',
    'dd000001-0000-0000-0000-000000000003',
    'ba923bb0-8961-4496-b2b1-8febac84f9e8',
    'available',
    'RO-B-1009999',
    'RO',
    '2029-03-15',
    true,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;


-- ─── Vehicles ─────────────────────────────────────────────────────────────────
INSERT INTO vehicles (
  id,
  operator_id,
  assigned_driver_id,
  segment,
  plate,
  make,
  model,
  year,
  color,
  is_active,
  created_at,
  updated_at
)
VALUES
  (
    'vh000001-0000-0000-0000-000000000001',
    'ba923bb0-8961-4496-b2b1-8febac84f9e8',
    'dr000001-0000-0000-0000-000000000001',
    'ride',
    'B-101-CHF',
    'Dacia',
    'Logan',
    2022,
    'White',
    true,
    now(),
    now()
  ),
  (
    'vh000001-0000-0000-0000-000000000002',
    'ba923bb0-8961-4496-b2b1-8febac84f9e8',
    'dr000001-0000-0000-0000-000000000002',
    'business',
    'B-202-CHF',
    'Mercedes-Benz',
    'E-Class',
    2023,
    'Black',
    true,
    now(),
    now()
  ),
  (
    'vh000001-0000-0000-0000-000000000003',
    'ba923bb0-8961-4496-b2b1-8febac84f9e8',
    'dr000001-0000-0000-0000-000000000003',
    'executive',
    'B-303-CHF',
    'BMW',
    '7 Series',
    2024,
    'Anthracite',
    true,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;
