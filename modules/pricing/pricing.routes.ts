import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { calculatePrice, defaultSnapshotForSegment } from './pricing.service';
import { getActiveRuleSnapshot } from './pricing.repository';
import { AppError } from '../../shared/errors/AppError';

const EstimateSchema = z.object({
  segment: z.enum(['ride', 'business', 'executive', 'office_lux', 'prime_lux']),
  distance_km: z.number().positive(),
  duration_sec: z.number().int().positive(),
  operator_id: z.string().uuid(),
});

const router = Router();

// POST /pricing/estimate — open to any authenticated user
router.post('/estimate', requireAuth, async (req: Request, res: Response) => {
  const input = EstimateSchema.parse(req.body);

  const snapshot =
    (await getActiveRuleSnapshot(input.operator_id, input.segment)) ??
    defaultSnapshotForSegment(input.segment);

  const result = calculatePrice({
    distance_km: input.distance_km,
    duration_sec: input.duration_sec,
    segment: input.segment,
    snapshot,
  });

  res.json({
    data: {
      ...result,
      segment: input.segment,
      distance_km: input.distance_km,
      duration_sec: input.duration_sec,
      using_default_rules: snapshot.rule_id === 'default',
    },
  });
});

export default router;
