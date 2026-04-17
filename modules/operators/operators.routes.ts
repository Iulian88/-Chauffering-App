import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { pool } from '../../shared/db/pg.client';
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

    const { rows } = await pool.query(`SELECT * FROM operators WHERE id = $1`, [req.params.id]);
    const data = rows[0];
    if (!data) throw AppError.notFound('Operator');
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
    const cols = Object.keys(updates);
    const vals = Object.values(updates);
    const setClauses = [...cols.map((c, i) => `${c} = $${i + 1}`), 'updated_at = now()'];
    const { rows } = await pool.query(
      `UPDATE operators SET ${setClauses.join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
      [...vals, req.params.id],
    );
    const data = rows[0];
    if (!data) throw AppError.notFound('Operator');
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
