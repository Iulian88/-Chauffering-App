import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { AppError } from '../../shared/errors/AppError';
import {
  getAssignments,
  addAssignment,
  promoteAssignment,
  removeAssignment,
} from './assignments.service';

const router = Router();

const CreateAssignmentSchema = z.object({
  driver_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  is_primary: z.boolean().default(false),
});

// GET /assignments — list all assignments (scoped by operator unless platform-wide)
router.get(
  '/',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    const { role, operator_id } = req.user!;
    const isPlatformWide = role === 'platform_admin' || role === 'superadmin';
    const scopedOperatorId = isPlatformWide ? undefined : (operator_id ?? undefined);
    if (!isPlatformWide && !operator_id) throw AppError.forbidden('No operator scope');

    const data = await getAssignments(scopedOperatorId);
    res.json({ data, count: data.length });
  },
);

// POST /assignments — create a new assignment
router.post(
  '/',
  requireAuth,
  requireRole('operator_admin', 'platform_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    const { role, operator_id } = req.user!;
    const input = CreateAssignmentSchema.parse(req.body);

    const data = await addAssignment({
      driver_id: input.driver_id,
      vehicle_id: input.vehicle_id,
      is_primary: input.is_primary,
      requester_operator_id: operator_id ?? null,
      requester_role: role,
    });

    res.status(201).json({ data });
  },
);

// PATCH /assignments/:id/set-primary — promote this assignment to primary
router.patch(
  '/:id/set-primary',
  requireAuth,
  requireRole('operator_admin', 'platform_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    const { role, operator_id } = req.user!;
    const data = await promoteAssignment(req.params.id, operator_id ?? null, role);
    res.json({ data });
  },
);

// DELETE /assignments/:id — soft delete (sets unassigned_at)
router.delete(
  '/:id',
  requireAuth,
  requireRole('operator_admin', 'platform_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    const { role, operator_id } = req.user!;
    await removeAssignment(req.params.id, operator_id ?? null, role);
    res.json({ message: 'Assignment removed' });
  },
);

export default router;
