import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { listDrivers, getDriver, setAvailability } from './drivers.service';

// ─── Schema ───────────────────────────────────────────────────────────────────
const UpdateAvailabilitySchema = z.object({
  availability_status: z.enum(['available', 'busy', 'offline']),
});

// ─── Controller ───────────────────────────────────────────────────────────────
async function handleListDrivers(req: Request, res: Response): Promise<void> {
  const drivers = await listDrivers(req.user!);
  res.json({ data: drivers, count: drivers.length });
}

async function handleGetDriver(req: Request, res: Response): Promise<void> {
  const driver = await getDriver(req.params.id, req.user!);
  res.json({ data: driver });
}

async function handleUpdateAvailability(req: Request, res: Response): Promise<void> {
  const { availability_status } = UpdateAvailabilitySchema.parse(req.body);
  const driver = await setAvailability(req.params.id, availability_status, req.user!);
  res.json({ data: driver });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
const router = Router();

router.get(
  '/',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleListDrivers,
);

router.get(
  '/:id',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'driver', 'platform_admin', 'superadmin'),
  handleGetDriver,
);

router.patch(
  '/:id/availability',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'driver', 'platform_admin', 'superadmin'),
  handleUpdateAvailability,
);

export default router;
