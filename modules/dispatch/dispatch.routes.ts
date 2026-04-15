import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { manualAssign, unassignTrip, getAvailableDriversForBooking } from './dispatch.service';

const ManualAssignSchema = z.object({
  booking_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
});

const router = Router();

// POST /dispatch/assign — create trip + assign driver
router.post(
  '/assign',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    const input = ManualAssignSchema.parse(req.body);
    const trip = await manualAssign(input, req.user!);
    res.status(201).json({ data: trip });
  },
);

// DELETE /dispatch/trips/:id/unassign — cancel trip, return booking to confirmed
router.delete(
  '/trips/:id/unassign',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    await unassignTrip(req.params.id, req.user!);
    res.json({ message: 'Trip unassigned. Booking returned to confirmed.' });
  },
);

// GET /dispatch/available-drivers/:bookingId
router.get(
  '/available-drivers/:bookingId',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    const drivers = await getAvailableDriversForBooking(req.params.bookingId, req.user!);
    res.json({ data: drivers });
  },
);

export default router;
