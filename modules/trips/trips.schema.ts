import { z } from 'zod';

export const CreateTripSchema = z.object({
  booking_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
});

export const UpdateTripStatusSchema = z.object({
  status: z.enum(['en_route', 'arrived', 'completed']),
});

export const RefuseTripSchema = z.object({
  refusal_reason: z.string().min(3).max(500).optional(),
});

export type CreateTripInput = z.infer<typeof CreateTripSchema>;
export type UpdateTripStatusInput = z.infer<typeof UpdateTripStatusSchema>;
export type RefuseTripInput = z.infer<typeof RefuseTripSchema>;
