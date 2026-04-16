import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { supabase } from '../../shared/db/supabase.client';
import { AppError } from '../../shared/errors/AppError';
import { checkOperatorHealth } from '../dispatch/dispatch.service';

const router = Router();

// GET /operators/:id — superadmin, platform_admin, or the operator itself
router.get(
  '/:id',
  requireAuth,
  requireRole('superadmin', 'platform_admin', 'operator_admin'),
  async (req: Request, res: Response) => {
    const user = req.user!;

    // operator_admin can only see their own operator; platform_admin/superadmin bypass
    if (
      user.role !== 'platform_admin' &&
      user.role !== 'superadmin' &&
      user.operator_id !== req.params.id
    ) {
      throw AppError.forbidden('Access denied');
    }

    const { data, error } = await supabase
      .from('operators')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) throw AppError.notFound('Operator');
    res.json({ data });
  },
);

// PATCH /operators/:id — update operator settings
router.patch(
  '/:id',
  requireAuth,
  requireRole('superadmin', 'platform_admin', 'operator_admin'),
  async (req: Request, res: Response) => {
    const user = req.user!;
    if (
      user.role !== 'platform_admin' &&
      user.role !== 'superadmin' &&
      user.operator_id !== req.params.id
    ) {
      throw AppError.forbidden('Access denied');
    }

    const UpdateSchema = z.object({
      name: z.string().min(2).optional(),
      timezone: z.string().optional(),
      locale: z.string().optional(),
    });

    const updates = UpdateSchema.parse(req.body);
    const { data, error } = await supabase
      .from('operators')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw AppError.internal(error.message);
    res.json({ data });
  },
);

// GET /operators/:id/health — dispatch readiness for an operator
router.get(
  '/:id/health',
  requireAuth,
  requireRole('superadmin', 'platform_admin', 'operator_admin'),
  async (req: Request, res: Response) => {
    const user = req.user!;
    if (
      user.role !== 'platform_admin' &&
      user.role !== 'superadmin' &&
      user.operator_id !== req.params.id
    ) {
      throw AppError.forbidden('Access denied');
    }
    const health = await checkOperatorHealth(req.params.id);
    res.json({ data: health });
  },
);

export default router;
