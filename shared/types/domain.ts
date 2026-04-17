// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'superadmin'
  | 'platform_admin'
  | 'operator_admin'
  | 'operator_dispatcher'
  | 'driver'
  | 'client';

export type DriverAvailabilityStatus = 'available' | 'busy' | 'offline';

export type VehicleSegment =
  | 'ride'
  | 'business'
  | 'executive'
  | 'office_lux'
  | 'prime_lux';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'dispatched'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

// Tracks the dispatch pipeline lifecycle independently of booking status.
export type DispatchStatus =
  | 'pending'      // just created, awaiting validation
  | 'ready'        // health check passed, can be auto-dispatched
  | 'dispatching'  // auto-dispatch in flight
  | 'assigned'     // driver successfully assigned
  | 'failed';      // dispatch failed, see dispatch_failures table

export type TripStatus =
  | 'assigned'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'refused'
  | 'cancelled';

export type DocumentOwnerType = 'driver' | 'vehicle';
export type DocumentType =
  | 'driving_license'
  | 'id_card'
  | 'vehicle_registration'
  | 'insurance'
  | 'roadworthiness';
export type DocumentStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type DispatchAction =
  | 'assigned'
  | 'reassigned'
  | 'unassigned'
  | 'auto_assigned';
export type DispatchOutcome = 'accepted' | 'refused' | 'no_response' | 'cancelled';

// ─── Core Entities ────────────────────────────────────────────────────────────

export interface Operator {
  id: string;
  name: string;
  slug: string;
  type: 'fleet' | 'self';   // fleet = company, self = independent driver operator
  timezone: string;
  locale: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  operator_id: string | null;
  full_name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  user_id: string;
  operator_id: string;
  availability_status: DriverAvailabilityStatus;
  license_number: string;
  license_country: string;
  license_expires_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  operator_id: string;
  assigned_driver_id: string | null;
  segment: VehicleSegment;
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PricingSnapshot {
  rule_id: string;
  base_fare: number;
  per_km_rate: number;
  per_min_rate: number;
  minimum_fare: number;
  surge_multiplier: number;
  currency: string;
}

export interface BookingStop {
  address: string;
  lat: number;
  lng: number;
  order: number;
}

export interface Booking {
  id: string;
  operator_id: string | null;
  client_user_id: string;
  pricing_rule_id: string | null;
  status: BookingStatus;
  segment: VehicleSegment;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  stops: BookingStop[] | null;
  scheduled_at: string;
  price_estimate: number;
  price_final: number | null;
  currency: string;
  distance_km: number;
  duration_sec: number;
  pricing_snapshot: PricingSnapshot;
  channel: string;
  partner: string;
  client_price: number | null;
  driver_price: number | null;
  profit: number | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  dispatch_status?: DispatchStatus;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  id: string;
  booking_id: string;
  driver_id: string;
  vehicle_id: string;
  operator_id: string;
  status: TripStatus;
  assigned_at: string;
  accepted_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  refused_at: string | null;
  refusal_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DispatchLog {
  id: string;
  trip_id: string;
  booking_id: string;
  driver_id: string;
  assigned_by: string | null;
  action: DispatchAction;
  outcome: DispatchOutcome | null;
  note: string | null;
  created_at: string;
}

export interface DispatchFailure {
  id: string;
  booking_id: string;
  reason: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

// ─── Auth Context ─────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  operator_id: string | null;
}
