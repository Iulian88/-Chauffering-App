import { Router, Request, Response } from 'express';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { pool } from '../../shared/db/pg.client';

const router = Router();

// GET /segments — returns all active segments ordered by sort_order
router.get(
  '/',
  requireAuth,
  async (_req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT name, label, is_active, sort_order
       FROM segments WHERE is_active = true ORDER BY sort_order ASC`,
    );
    res.json({ data: rows });
  },
);

export default router;
