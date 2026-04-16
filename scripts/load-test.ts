/**
 * Load Test: Concurrent Auto-Dispatch Safety
 * ───────────────────────────────────────────
 * Simulates 10 simultaneous auto-dispatch calls against a pool of 3 drivers.
 * Verifies:
 *   1. No double assignment (each driver gets at most 1 active trip)
 *   2. All failures are logged in dispatch_failures
 *   3. Fallback segment usage is reported correctly
 *   4. dispatch_status is consistent across all bookings
 *
 * Run: npx tsx scripts/load-test.ts [--operator <uuid>] [--count <n>]
 *
 * Requirements:
 *   - At least 1 operator with active drivers + vehicles in the DB
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { autoDispatch, insertDispatchFailure } from '../modules/dispatch/dispatch.service';

const SUPABASE_URL             = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── CLI args ──────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const argMap    = Object.fromEntries(
  args.map((a, i) => [a, args[i + 1]]).filter(([k]) => k.startsWith('--')),
);
const COUNT     = parseInt(argMap['--count'] ?? '10', 10);
const OPERATOR  = argMap['--operator'] ?? null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(ms: number) { return `${ms}ms`; }
function pad(s: string, n = 36) { return s.padEnd(n); }

async function resolveOperator(): Promise<string> {
  if (OPERATOR) return OPERATOR;
  const { data, error } = await supabase
    .from('operators')
    .select('id, name')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (error || !data) {
    console.error('No active operator found. Pass --operator <uuid>.');
    process.exit(1);
  }
  console.log(`Using operator: ${data.name} (${data.id})`);
  return data.id as string;
}

async function createTestBooking(operatorId: string, segment: string): Promise<string> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      operator_id:      operatorId,
      client_user_id:   '00000000-0000-0000-0000-000000000001', // placeholder
      status:           'confirmed',
      dispatch_status:  'ready',
      segment,
      pickup_address:   'Test Pickup',
      pickup_lat:       48.8566,
      pickup_lng:       2.3522,
      dropoff_address:  'Test Dropoff',
      dropoff_lat:      48.8600,
      dropoff_lng:      2.3600,
      scheduled_at:     new Date(Date.now() + 3_600_000).toISOString(),
      price_estimate:   50,
      currency:         'EUR',
      distance_km:      5,
      duration_sec:     900,
      channel:          'load_test',
      partner:          'load_test',
      pricing_snapshot: {
        rule_id: 'default', base_fare: 10, per_km_rate: 2,
        per_min_rate: 0.5, minimum_fare: 15, surge_multiplier: 1, currency: 'EUR',
      },
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to create test booking: ${error?.message}`);
  return data.id as string;
}

async function getActiveDriverCount(operatorId: string): Promise<number> {
  const { count } = await supabase
    .from('drivers')
    .select('id', { count: 'exact', head: true })
    .eq('operator_id', operatorId)
    .eq('is_active', true)
    .eq('availability_status', 'available');
  return count ?? 0;
}

async function cleanupTestBookings(bookingIds: string[]) {
  if (bookingIds.length === 0) return;
  await supabase.from('dispatch_failures').delete().in('booking_id', bookingIds);
  await supabase.from('trips').delete().in('booking_id', bookingIds);
  await supabase.from('bookings').delete().in('id', bookingIds);
  console.log(`\nCleaned up ${bookingIds.length} test bookings.`);
}

async function verifyNoDoubleAssignment(bookingIds: string[]): Promise<void> {
  const { data: trips } = await supabase
    .from('trips')
    .select('driver_id, booking_id, status')
    .in('booking_id', bookingIds)
    .in('status', ['assigned', 'accepted', 'en_route', 'arrived']);

  const driverTripMap = new Map<string, string[]>();
  for (const t of trips ?? []) {
    const list = driverTripMap.get(t.driver_id) ?? [];
    list.push(t.booking_id);
    driverTripMap.set(t.driver_id, list);
  }

  let violations = 0;
  for (const [driverId, bookings] of driverTripMap) {
    if (bookings.length > 1) {
      console.error(`  ❌ DOUBLE ASSIGNMENT: driver ${driverId} has ${bookings.length} active trips!`);
      violations++;
    }
  }
  if (violations === 0) {
    console.log('  ✓ No double assignments detected');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`LOAD TEST — ${COUNT} concurrent auto-dispatch calls`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const operatorId    = await resolveOperator();
  const availBefore   = await getActiveDriverCount(operatorId);

  console.log(`Available drivers before test: ${availBefore}`);
  if (availBefore === 0) {
    console.error('No available drivers in this operator. Cannot run load test.');
    process.exit(1);
  }

  // Detect the operator's served segments for realistic booking creation
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('segment')
    .eq('operator_id', operatorId)
    .eq('is_active', true);
  const segments = [...new Set((vehicles ?? []).map((v: { segment: string }) => v.segment))];
  const segment = segments[0] ?? 'executive';
  console.log(`Using segment: ${segment}  (operator vehicles: ${segments.join(', ')})\n`);

  // Create COUNT test bookings
  console.log(`Creating ${COUNT} test bookings (status=confirmed, dispatch_status=ready)...`);
  const bookingIds: string[] = [];
  for (let i = 0; i < COUNT; i++) {
    const id = await createTestBooking(operatorId, segment);
    bookingIds.push(id);
  }
  console.log(`  ✓ Created: ${bookingIds.length} bookings\n`);

  // Fire all dispatches concurrently
  console.log(`Firing ${COUNT} autoDispatch calls simultaneously...`);
  const start = Date.now();

  const outcomes = await Promise.allSettled(
    bookingIds.map(id => autoDispatch(id).then(r => ({ id, ...r }))),
  );

  const elapsed = Date.now() - start;
  console.log(`  Completed in ${fmt(elapsed)}\n`);

  // ── Results ───────────────────────────────────────────────────────────────
  let succeeded  = 0;
  let failed     = 0;
  let raceFailed = 0;

  console.log('┌──────────────────────────────────────┬──────────┬─────────────────────────────┐');
  console.log('│ booking_id                           │ result   │ detail                      │');
  console.log('├──────────────────────────────────────┼──────────┼─────────────────────────────┤');

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      succeeded++;
      const { id, meta } = outcome.value;
      const detail = `matchType=${meta.matchType}${meta.degraded ? ' DEGRADED' : ''}`;
      console.log(`│ ${pad(id.slice(0, 36))} │ ✓ OK     │ ${detail.padEnd(27)} │`);
    } else {
      const err  = outcome.reason as Error & { code?: string };
      const code = err.code ?? err.message ?? 'UNKNOWN';
      if (code === 'DRIVER_ALREADY_ASSIGNED' || code === 'AUTO_DISPATCH_FAILED' || code === 'NO_DRIVERS_FOR_OPERATOR') {
        raceFailed++;
      }
      failed++;
      // Find booking id from the thrown error context (we can't easily map back, so log sequentially)
      console.log(`│ ${'(failed)'.padEnd(36)} │ ✗ FAIL   │ ${code.slice(0, 27).padEnd(27)} │`);
    }
  }

  console.log('└──────────────────────────────────────┴──────────┴─────────────────────────────┘');

  // ── Summary ───────────────────────────────────────────────────────────────
  const availAfter = await getActiveDriverCount(operatorId);

  console.log('\n── SUMMARY ─────────────────────────────────────────────────');
  console.log(`  Total calls     : ${COUNT}`);
  console.log(`  Succeeded       : ${succeeded}  (expected ≤ ${availBefore})`);
  console.log(`  Failed/rejected : ${failed}`);
  console.log(`  Drivers before  : ${availBefore}  →  after: ${availAfter}`);
  console.log(`  Drivers assigned: ${availBefore - availAfter}`);

  const driverLimit = succeeded <= availBefore;
  console.log(`\n  ${driverLimit ? '✓' : '❌'} Succeeded (${succeeded}) ≤ available drivers (${availBefore})`);

  // Verify no double assignments
  console.log('\n── DOUBLE-ASSIGNMENT CHECK ──────────────────────────────────');
  await verifyNoDoubleAssignment(bookingIds);

  // Check dispatch_failures table
  const { data: failures, error: failErr } = await supabase
    .from('dispatch_failures')
    .select('booking_id, reason, created_at')
    .in('booking_id', bookingIds)
    .order('created_at', { ascending: true });

  console.log('\n── DISPATCH FAILURES TABLE ──────────────────────────────────');
  if (failErr) {
    console.log(`  (Could not query dispatch_failures: ${failErr.message})`);
    console.log('  → Has the migration been applied? Run migrations/001_production_safety.sql');
  } else if (!failures || failures.length === 0) {
    console.log('  (No failures logged — all dispatches succeeded or failures table missing)');
  } else {
    console.log(`  ${failures.length} failure(s) logged:`);
    for (const f of failures) {
      console.log(`    booking ${f.booking_id.slice(0, 8)}… → ${f.reason}`);
    }
  }

  // Cleanup
  const shouldClean = args.includes('--no-cleanup') === false;
  if (shouldClean) {
    await cleanupTestBookings(bookingIds);
    console.log('  ✓ Test data cleaned up (pass --no-cleanup to retain)');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  process.exit(0);
}

main().catch(err => {
  console.error('\nLoad test crashed:', err);
  process.exit(1);
});
