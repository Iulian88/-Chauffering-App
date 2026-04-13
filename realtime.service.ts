/**
 * Realtime module
 *
 * MVP approach: Supabase Realtime channels are subscribed client-side
 * (in the operator and driver apps). The backend's responsibility is:
 *   1. Emit structured events to Supabase Realtime broadcast channels
 *      after state-changing operations.
 *   2. Provide a consistent event schema so clients can react to changes.
 *
 * Channel convention:
 *   operator:{operator_id}  — all events for an operator's scope
 *   driver:{driver_id}      — events targeted at a specific driver
 */

import { supabase } from '../../shared/db/supabase.client';

export type RealtimeEventType =
  | 'booking.created'
  | 'booking.cancelled'
  | 'booking.status_changed'
  | 'trip.created'
  | 'trip.status_changed'
  | 'driver.availability_changed';

export interface RealtimeEvent<T = unknown> {
  type: RealtimeEventType;
  payload: T;
  timestamp: string;
}

export async function emitToOperator<T>(
  operator_id: string,
  event: RealtimeEventType,
  payload: T,
): Promise<void> {
  try {
    await supabase.channel(`operator:${operator_id}`).send({
      type: 'broadcast',
      event,
      payload: {
        type: event,
        payload,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    // Realtime errors are non-fatal — log and continue
    console.error('[Realtime] emitToOperator failed:', err);
  }
}

export async function emitToDriver<T>(
  driver_id: string,
  event: RealtimeEventType,
  payload: T,
): Promise<void> {
  try {
    await supabase.channel(`driver:${driver_id}`).send({
      type: 'broadcast',
      event,
      payload: {
        type: event,
        payload,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Realtime] emitToDriver failed:', err);
  }
}
