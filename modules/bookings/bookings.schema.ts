import { z } from 'zod';

export const CreateBookingSchema = z.object({
  segment: z.enum(['ride', 'business', 'executive', 'office_lux', 'prime_lux']),
  pickup_address: z.string().min(5),
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  dropoff_address: z.string().min(5),
  dropoff_lat: z.number().min(-90).max(90),
  dropoff_lng: z.number().min(-180).max(180),
  scheduled_at: z.string().datetime(),
  stops: z
    .array(
      z.object({
        address: z.string(),
        lat: z.number(),
        lng: z.number(),
        order: z.number().int().positive(),
      }),
    )
    .optional(),
  // distance + duration provided by client (from Maps SDK) or computed server-side
  distance_km: z.number().positive(),
  duration_sec: z.number().int().positive(),
  // ─── Commercial fields ────────────────────────────────────────────────────
  channel: z.string().max(64).optional(),
  partner: z.string().max(128).optional(),
  client_price: z.number().nonnegative().optional(),
  driver_price: z.number().nonnegative().optional(),
});

export const CancelBookingSchema = z.object({
  cancellation_reason: z.string().min(3).max(500).optional(),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;
