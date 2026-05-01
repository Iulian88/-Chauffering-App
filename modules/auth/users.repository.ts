import { pool } from '../../shared/db/pg.client';

export async function updateFcmToken(userId: string, token: string): Promise<void> {
  await pool.query(
    `UPDATE users SET fcm_token = $1 WHERE id = $2`,
    [token, userId],
  );
}

export async function getFcmTokenByUserId(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ fcm_token: string | null }>(
    `SELECT fcm_token FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.fcm_token ?? null;
}

export async function getFcmTokenByDriverId(driverId: string): Promise<string | null> {
  const { rows } = await pool.query<{ fcm_token: string | null }>(
    `SELECT u.fcm_token FROM users u JOIN drivers d ON d.user_id = u.id WHERE d.id = $1`,
    [driverId],
  );
  return rows[0]?.fcm_token ?? null;
}
