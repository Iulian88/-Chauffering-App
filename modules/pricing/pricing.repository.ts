import { supabase } from '../../shared/db/supabase.client';
import { VehicleSegment, PricingSnapshot } from '../../shared/types/domain';

export async function getActiveRuleSnapshot(
  operator_id: string,
  segment: VehicleSegment,
): Promise<PricingSnapshot | null> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('pricing_rules')
    .select('id, base_fare, per_km_rate, per_min_rate, minimum_fare, surge_multiplier, currency')
    .eq('operator_id', operator_id)
    .eq('segment', segment)
    .eq('is_active', true)
    .lte('valid_from', now)
    .or(`valid_until.is.null,valid_until.gte.${now}`)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

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
