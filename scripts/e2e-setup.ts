import { pool } from '../shared/db/pg.client';

async function main() {
  // Apply migrations — idempotent
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT`);
  console.log('Migration applied: fcm_token column ready');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications_log (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID        NOT NULL,
      operator_id  UUID        NOT NULL,
      channel      TEXT        NOT NULL,
      template_key TEXT        NOT NULL,
      title        TEXT        NOT NULL,
      body         TEXT        NOT NULL,
      payload      JSONB,
      status       TEXT        NOT NULL DEFAULT 'pending',
      sent_at      TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('Migration applied: notifications_log table ready');

  // Get driver emails
  const { rows: drivers } = await pool.query(`
    SELECT u.id, u.email, u.fcm_token, d.id as driver_id, d.operator_id
    FROM users u
    JOIN drivers d ON d.user_id = u.id
    ORDER BY d.created_at
    LIMIT 5
  `);
  console.log('DRIVERS:', JSON.stringify(drivers, null, 2));

  // Set a test FCM token on driver 2 (Sofer Afiliat, operator 6d6b4fad)
  const DRIVER2_USER_ID = '2ac1852e-d9bb-498c-8d27-5270b458202f';
  await pool.query(
    `UPDATE users SET fcm_token = $1 WHERE id = $2`,
    ['test-fcm-token-e2e-12345', DRIVER2_USER_ID]
  );
  console.log('FCM token set for driver2 user');

  // Check notifications_log entries
  const { rows: logs } = await pool.query(
    'SELECT * FROM notifications_log ORDER BY created_at DESC LIMIT 10'
  );
  console.log('NOTIFICATION LOGS:', JSON.stringify(logs, null, 2));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
