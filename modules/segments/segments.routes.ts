import { Router, Request, Response } from 'express';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { supabase } from '../../shared/db/supabase.client';
import { AppError } from '../../shared/errors/AppError';

const router = Router();

// GET /segments — returns all active segments ordered by sort_order
router.get(
  '/',
  requireAuth,
  async (_req: Request, res: Response) => {
    const { data, error } = await supabase
      .from('segments')
      .select('name, label, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw AppError.internal(error.message);
    res.json({ data: data ?? [] });
  },
);

export default router;
