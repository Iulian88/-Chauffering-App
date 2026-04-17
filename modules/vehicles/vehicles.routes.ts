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
  // assigned_driver_id intentionally excluded — use /assignments API instead
});

router.get(
  '/',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    const { operator_id, role } = req.user!;
    if (role !== 'platform_admin' && role !== 'superadmin' && !operator_id) {
      throw AppError.forbidden('No operator scope');
    }

    // Fetch vehicles with their primary assigned driver (via driver_vehicle_assignments)
    // superadmin/platform_admin may have operator_id = null → return all vehicles in that case
    let vehicleQuery = supabase
      .from('vehicles')
      .select('id, operator_id, segment, plate, make, model, year, color, is_active, created_at, updated_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (operator_id) {
      vehicleQuery = vehicleQuery.eq('operator_id', operator_id);
    }

    const { data: rawVehicles, error } = await vehicleQuery;

    if (error) throw AppError.internal(error.message);
    const vehicleIds = (rawVehicles ?? []).map((v: { id: string }) => v.id);

    // Fetch primary assignments for these vehicles
    const { data: assignments } = vehicleIds.length > 0
      ? await supabase
          .from('driver_vehicle_assignments')
          .select('vehicle_id, driver_id, is_primary')
          .in('vehicle_id', vehicleIds)
          .eq('is_primary', true)
      : { data: [] };

    const assignmentMap = new Map(
      (assignments ?? []).map((a: { vehicle_id: string; driver_id: string }) => [a.vehicle_id, a.driver_id]),
    );

    const data = (rawVehicles ?? []).map((v: Record<string, unknown>) => ({
      ...v,
      assigned_driver_id: assignmentMap.get(v.id as string) ?? null,
    }));

    res.json({ data: data ?? [], count: data?.length ?? 0 });
  },
);

router.post(
  '/',
  requireAuth,
  requireRole('operator_admin', 'platform_admin', 'superadmin'),
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
  requireRole('operator_admin', 'platform_admin', 'superadmin'),
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
