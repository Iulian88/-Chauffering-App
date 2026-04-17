import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { listDrivers, listAvailableDrivers, getDriver, setAvailability, createDriver } from './drivers.service';

// ─── Schemas ──────────────────────────────────────────────────────────────────
const UpdateAvailabilitySchema = z.object({
  availability_status: z.enum(['available', 'busy', 'offline']),
});

const CreateDriverSchema = z.object({
  user_id: z.string().uuid(),
  license_number: z.string().min(2),
  license_country: z.string().min(2).max(2),
  license_expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  operator_id: z.string().uuid().optional(),
  availability_status: z.enum(['available', 'busy', 'offline']).optional(),
  is_active: z.boolean().optional(),
});

async function handleCreateDriver(req: Request, res: Response): Promise<void> {
  const input = CreateDriverSchema.parse(req.body);
  const driver = await createDriver(input, req.user!);
  res.status(201).json({ data: driver });
}

// ─── Controller ───────────────────────────────────────────────────────────────
async function handleListAvailableDrivers(req: Request, res: Response): Promise<void> {
  const segment = typeof req.query.segment === 'string' ? req.query.segment : undefined;
  const { drivers, count } = await listAvailableDrivers(req, req.user!, segment);
  res.json({ data: drivers, count });
}

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

// POST /drivers — create a driver (superadmin/platform_admin/operator_admin)
// If operator_id is not supplied and caller is superadmin, auto-assigns the
// shared "Independent" self-operator.
router.post(
  '/',
  requireAuth,
  requireRole('operator_admin', 'platform_admin', 'superadmin'),
  handleCreateDriver,
);

// IMPORTANT: must be before /:id to avoid Express treating 'available' as an id param
router.get(
  '/available',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleListAvailableDrivers,
);

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
