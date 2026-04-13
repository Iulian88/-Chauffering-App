import { VehicleSegment, PricingSnapshot } from '../../shared/types/domain';

export interface PriceInput {
  distance_km: number;
  duration_sec: number;
  segment: VehicleSegment;
  snapshot: PricingSnapshot;
}

export interface PriceResult {
  price: number;
  currency: string;
  breakdown: {
    base_fare: number;
    distance_charge: number;
    time_charge: number;
    surge_multiplier: number;
    total_before_surge: number;
  };
}

export interface EstimateInput {
  distance_km: number;
  duration_sec: number;
  segment: VehicleSegment;
  snapshot: PricingSnapshot;
}

// Pure calculation — no I/O, fully testable
export function calculatePrice(input: PriceInput): PriceResult {
  const { distance_km, duration_sec, snapshot } = input;
  const duration_min = duration_sec / 60;

  const base_fare = snapshot.base_fare;
  const distance_charge = distance_km * snapshot.per_km_rate;
  const time_charge = duration_min * snapshot.per_min_rate;
  const total_before_surge = base_fare + distance_charge + time_charge;

  const total = Math.max(
    total_before_surge * snapshot.surge_multiplier,
    snapshot.minimum_fare,
  );

  return {
    price: Math.round(total * 100) / 100,
    currency: snapshot.currency,
    breakdown: {
      base_fare,
      distance_charge: Math.round(distance_charge * 100) / 100,
      time_charge: Math.round(time_charge * 100) / 100,
      surge_multiplier: snapshot.surge_multiplier,
      total_before_surge: Math.round(total_before_surge * 100) / 100,
    },
  };
}

// Segment-based default snapshot for estimation when no rule is loaded
export function defaultSnapshotForSegment(segment: VehicleSegment): PricingSnapshot {
  const defaults: Record<VehicleSegment, Omit<PricingSnapshot, 'rule_id'>> = {
    ride:        { base_fare: 5,    per_km_rate: 1.2,  per_min_rate: 0.2,  minimum_fare: 8,   surge_multiplier: 1.0, currency: 'RON' },
    business:    { base_fare: 8,    per_km_rate: 1.8,  per_min_rate: 0.3,  minimum_fare: 12,  surge_multiplier: 1.0, currency: 'RON' },
    executive:   { base_fare: 12,   per_km_rate: 2.4,  per_min_rate: 0.4,  minimum_fare: 18,  surge_multiplier: 1.0, currency: 'RON' },
    office_lux:  { base_fare: 18,   per_km_rate: 3.0,  per_min_rate: 0.5,  minimum_fare: 25,  surge_multiplier: 1.0, currency: 'RON' },
    prime_lux:   { base_fare: 25,   per_km_rate: 4.0,  per_min_rate: 0.7,  minimum_fare: 40,  surge_multiplier: 1.0, currency: 'RON' },
  };
  return { rule_id: 'default', ...defaults[segment] };
}
