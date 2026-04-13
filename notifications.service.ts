/**
 * Notifications service (MVP)
 *
 * In MVP, notifications are fire-and-forget push via Firebase Admin SDK.
 * Each send is logged to the notifications_log table regardless of outcome.
 *
 * Firebase Admin SDK is initialised lazily so the server starts without
 * the SDK if FIREBASE_SERVICE_ACCOUNT is not configured.
 */

import { supabase } from '../../shared/db/supabase.client';

export type NotificationChannel = 'push' | 'sms' | 'email';

export interface SendNotificationInput {
  user_id: string;
  operator_id: string;
  channel: NotificationChannel;
  template_key: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  fcm_token?: string; // required for push
}

export async function sendNotification(input: SendNotificationInput): Promise<void> {
  let status: 'sent' | 'failed' = 'failed';
  let sent_at: string | null = null;

  try {
    if (input.channel === 'push' && input.fcm_token) {
      await sendFirebasePush(input.fcm_token, input.title, input.body, input.payload);
      status = 'sent';
      sent_at = new Date().toISOString();
    }
    // SMS / email channels: wire up provider here in future
  } catch (err) {
    console.error('[Notifications] send failed:', err);
  }

  // Always log — non-fatal if insert fails
  try {
    await supabase.from('notifications_log').insert({
      user_id: input.user_id,
      operator_id: input.operator_id,
      channel: input.channel,
      template_key: input.template_key,
      title: input.title,
      body: input.body,
      payload: input.payload ?? null,
      status,
      sent_at,
    });
  } catch (logErr) {
    console.error('[Notifications] log insert failed:', logErr);
  }
}

// ─── Firebase push (lazy init) ────────────────────────────────────────────────
let firebaseAdmin: typeof import('firebase-admin') | null = null;

async function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) return null;

  try {
    const admin = await import('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      });
    }
    firebaseAdmin = admin;
    return admin;
  } catch {
    console.warn('[Notifications] firebase-admin not available');
    return null;
  }
}

async function sendFirebasePush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const admin = await getFirebaseAdmin();
  if (!admin) return;

  await admin.messaging().send({
    token,
    notification: { title, body },
    data: data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : undefined,
  });
}

// ─── Convenience helpers used by other modules ────────────────────────────────
export async function notifyDriverNewTrip(opts: {
  driver_user_id: string;
  driver_id: string;
  operator_id: string;
  trip_id: string;
  fcm_token?: string;
}): Promise<void> {
  await sendNotification({
    user_id: opts.driver_user_id,
    operator_id: opts.operator_id,
    channel: 'push',
    template_key: 'trip.new_assignment',
    title: 'New trip assigned',
    body: 'You have a new trip. Tap to view details.',
    payload: { trip_id: opts.trip_id },
    fcm_token: opts.fcm_token,
  });
}

export async function notifyOperatorTripRefused(opts: {
  operator_user_id: string;
  operator_id: string;
  trip_id: string;
  booking_id: string;
}): Promise<void> {
  await sendNotification({
    user_id: opts.operator_user_id,
    operator_id: opts.operator_id,
    channel: 'push',
    template_key: 'trip.refused',
    title: 'Trip refused by driver',
    body: 'A driver refused a trip. Please reassign.',
    payload: { trip_id: opts.trip_id, booking_id: opts.booking_id },
  });
}
