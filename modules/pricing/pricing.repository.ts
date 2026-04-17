import { pool } from '../../shared/db/pg.client';
import { VehicleSegment, PricingSnapshot } from '../../shared/types/domain';

export async function getActiveRuleSnapshot(
  operator_id: string,
  segment: VehicleSegment,
): Promise<PricingSnapshot | null> {
  const now = new Date().toISOString();

  const { rows } = await pool.query(
    `SELECT id, base_fare, per_km_rate, per_min_rate, minimum_fare, surge_multiplier, currency
     FROM pricing_rules
     WHERE operator_id = $1 AND segment = $2 AND is_active = true
       AND valid_from <= $3 AND (valid_until IS NULL OR valid_until >= $3)
     ORDER BY valid_from DESC LIMIT 1`,
    [operator_id, segment, now],
  );

  const data = rows[0];
  if (!data) return null;

  return {
    rule_id: data.id,
    base_fare: Number(data.base_fare),
    per_km_rate: Number(data.per_km_rate),
    per_min_rate: Number(data.per_min_rate),
    minimum_fare: Number(data.minimum_fare),
    surge_multiplier: Number(data.surge_multiplier),
    currency: data.currency,
  };
}
