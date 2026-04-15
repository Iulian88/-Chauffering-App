import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { supabase } from '../../shared/db/supabase.client';
import { AppError } from '../../shared/errors/AppError';

const router = Router();

const VehicleSchema = z.object({
  segment: z.enum(['ride', 'business', 'executive', 'office_lux', 'prime_lux']),
  plate: z.string().min(4),
  make: z.string().min(2),
  model: z.string().min(1),
  year: z.number().int().min(2000).max(new Date().getFullYear() + 1),
  color: z.string().optional(),
  assigned_driver_id: z.string().uuid().nullable().optional(),
});

router.get(
  '/',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher'),
  async (req: Request, res: Response) => {
    const { operator_id, role } = req.user!;
    if (role !== 'platform_admin' && role !== 'superadmin' && !operator_id) {
      throw AppError.forbidden('No operator scope');
    }

    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('operator_id', operator_id as string)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw AppError.internal(error.message);
    res.json({ data: data ?? [], count: data?.length ?? 0 });
  },
);

router.post(
  '/',
  requireAuth,
  requireRole('operator_admin'),
  async (req: Request, res: Response) => {
    const { operator_id } = req.user!;
    if (!operator_id) throw AppError.forbidden('No operator scope');

    const input = VehicleSchema.parse(req.body);
    const { data, error } = await supabase
      .from('vehicles')
      .insert({ ...input, operator_id })
      .select()
      .single();

    if (error) throw AppError.internal(error.message);
    res.status(201).json({ data });
  },
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('operator_admin'),
  async (req: Request, res: Response) => {
    const { operator_id } = req.user!;
    if (!operator_id) throw AppError.forbidden('No operator scope');

    const updates = VehicleSchema.partial().parse(req.body);
    const { data, error } = await supabase
      .from('vehicles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('operator_id', operator_id)
      .select()
      .single();

    if (error) throw AppError.internal(error.message);
    if (!data) throw AppError.notFound('Vehicle');
    res.json({ data });
  },
);

export default router;
