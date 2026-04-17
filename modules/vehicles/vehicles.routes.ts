import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { pool } from '../../shared/db/pg.client';
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
    const { rows: rawVehicles } = operator_id
      ? await pool.query(
          `SELECT id, operator_id, segment, plate, make, model, year, color, is_active, created_at, updated_at
           FROM vehicles WHERE is_active = true AND operator_id = $1 ORDER BY created_at DESC`,
          [operator_id],
        )
      : await pool.query(
          `SELECT id, operator_id, segment, plate, make, model, year, color, is_active, created_at, updated_at
           FROM vehicles WHERE is_active = true ORDER BY created_at DESC`,
        );

    const vehicleIds = rawVehicles.map((v: { id: string }) => v.id);

    // Fetch primary assignments for these vehicles
    const { rows: assignments } = vehicleIds.length > 0
      ? await pool.query(
          `SELECT vehicle_id, driver_id FROM driver_vehicle_assignments
           WHERE vehicle_id = ANY($1) AND is_primary = true`,
          [vehicleIds],
        )
      : { rows: [] };

    const assignmentMap = new Map(
      assignments.map((a: { vehicle_id: string; driver_id: string }) => [a.vehicle_id, a.driver_id]),
    );

    const data = rawVehicles.map((v: Record<string, unknown>) => ({
      ...v,
      assigned_driver_id: assignmentMap.get(v.id as string) ?? null,
    }));

    console.log(`[vehicles GET] role=${role} operator_id=${operator_id ?? 'null'} rawVehicles=${rawVehicles.length} returned=${data.length}`);

    res.json({ data, count: data.length });
  },
);

router.post(
  '/',
  requireAuth,
  requireRole('operator_admin', 'platform_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    const { operator_id: userOperatorId, role } = req.user!;
    const isSuperAdmin = role === 'platform_admin' || role === 'superadmin';
    // superadmin/platform_admin may supply operator_id in body; operator staff always use their own
    const operator_id = isSuperAdmin
      ? (req.body.operator_id as string | undefined) ?? userOperatorId
      : userOperatorId;
    if (!operator_id) throw AppError.forbidden('No operator scope — supply operator_id in body');

    const input = VehicleSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO vehicles (operator_id, segment, plate, make, model, year, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [operator_id, input.segment, input.plate, input.make, input.model, input.year, input.color ?? null],
    );
    const data = rows[0];
    if (!data) throw AppError.internal('Failed to create vehicle');
    console.log(`[vehicles POST] created vehicle ${(data as { id: string }).id} for operator ${operator_id}`);
    res.status(201).json({ data });
  },
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('operator_admin', 'platform_admin', 'superadmin'),
  async (req: Request, res: Response) => {
    const { operator_id: userOperatorId, role } = req.user!;
    const isSuperAdmin = role === 'platform_admin' || role === 'superadmin';
    if (!isSuperAdmin && !userOperatorId) throw AppError.forbidden('No operator scope');

    const updates = VehicleSchema.partial().parse(req.body);
    // superadmin can edit any vehicle; operator staff restricted to their own fleet
    const updateCols = Object.keys(updates);
    const updateVals = Object.values(updates);
    const setClauses = [...updateCols.map((c, i) => `${c} = $${i + 1}`), `updated_at = now()`];
    let idx = updateCols.length + 1;

    const sql = isSuperAdmin
      ? `UPDATE vehicles SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`
      : `UPDATE vehicles SET ${setClauses.join(', ')} WHERE id = $${idx} AND operator_id = $${idx + 1} RETURNING *`;

    const params = isSuperAdmin
      ? [...updateVals, req.params.id]
      : [...updateVals, req.params.id, userOperatorId!];

    const { rows } = await pool.query(sql, params);
    const data = rows[0];
    if (!data) throw AppError.notFound('Vehicle');
    res.json({ data });
  },
);

export default router;
