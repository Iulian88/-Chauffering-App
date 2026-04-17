// ─── Domain types (mirrored from backend domain.ts) ─────────────────────────

export interface Booking {
  id: string
  operator_id: string | null
  client_user_id: string
  pricing_rule_id: string | null
  status: BookingStatus
  segment: VehicleSegment
  pickup_address: string
  pickup_lat: number
  pickup_lng: number
  dropoff_address: string
  dropoff_lat: number
  dropoff_lng: number
  stops: unknown | null
  scheduled_at: string
  price_estimate: number
  price_final: number | null
  currency: string
  distance_km: number
  duration_sec: number
  pricing_snapshot: PricingSnapshot
  cancellation_reason: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'dispatched'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'pending_operator'
  | 'accepted_operator'
  | 'pending_driver'

export type VehicleSegment = 'ride' | 'business' | 'executive' | 'office_lux' | 'prime_lux'

export interface PricingSnapshot {
  rule_id: string
  base_fare: number
  per_km_rate: number
  per_min_rate: number
  minimum_fare: number
  surge_multiplier: number
  currency: string
}

export interface Driver {
  id: string
  user_id: string
  operator_id: string
  availability_status: DriverAvailability
  license_number: string
  license_country: string
  license_expires_at: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined
  user_profiles?: { full_name: string; phone: string | null }
  vehicles?: Vehicle[]
}

export type DriverAvailability = 'available' | 'busy' | 'offline'

export interface DispatchMeta {
  totalDrivers: number
  withVehicle: number
  exactMatches: number
  fallbackUsed: boolean
  reasonIfEmpty: string | null
  matchType: 'exact' | 'fallback' | 'none'
  degraded: boolean
  missingAssignments: number
}

export interface Assignment {
  id: string
  driver_id: string
  vehicle_id: string
  operator_id: string
  is_primary: boolean
  // Joined
  driver?: { id: string; license_number: string; user_profiles?: { full_name: string; phone: string | null } }
  vehicle?: { id: string; plate: string; make: string; model: string; segment: VehicleSegment; is_active: boolean }
}

export interface Segment {
  name: string
  label: string
  is_active: boolean
  sort_order: number
}

export interface OperatorHealth {
  operatorId: string
  drivers: number
  vehicles: number
  segmentsCovered: string[]
  missingSegments: string[]
  hasNoCoverage: boolean
}

export interface Vehicle {
  id: string
  operator_id: string
  assigned_driver_id: string | null
  segment: VehicleSegment
  plate: string
  make: string
  model: string
  year: number
  color: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Marketplace types ────────────────────────────────────────────────────────

export interface MarketplaceBooking {
  id: string
  segment: VehicleSegment
  status: BookingStatus
  pickup_address: string
  pickup_lat: number
  pickup_lng: number
  dropoff_address: string
  dropoff_lat: number
  dropoff_lng: number
  scheduled_at: string
  currency: string
  distance_km: number
  duration_sec: number
  client_price: number | null
  driver_price: number | null
  profit: number | null
  offer_expires_at: string | null
  marketplace_visible: boolean
  created_at: string
}

export interface MarketplaceOperator {
  id: string
  name: string
  slug: string
  type: 'fleet' | 'self'
  timezone: string
  locale: string
}

export interface DriverAffiliation {
  id: string
  driver_id: string
  operator_id: string
  status: 'pending' | 'active' | 'suspended'
  commission_pct: number | null
  note: string | null
  created_at: string
  updated_at: string
  operator_name?: string
  driver_license?: string
  driver_availability?: string
}

export interface ClientFavorite {
  id: string
  client_user_id: string
  driver_id: string
  created_at: string
  availability_status: string | null
  license_country: string | null
}

export interface Trip {
  id: string
  booking_id: string
  driver_id: string
  vehicle_id: string
  operator_id: string
  status: TripStatus
  assigned_at: string
  accepted_at: string | null
  en_route_at: string | null
  arrived_at: string | null
  completed_at: string | null
  refused_at: string | null
  refusal_reason: string | null
  created_at: string
  updated_at: string
}

export type TripStatus =
  | 'assigned'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'refused'
  | 'cancelled'

// ─── API client ──────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

export interface CreateBookingBody {
  segment: VehicleSegment
  pickup_address: string
  pickup_lat: number
  pickup_lng: number
  dropoff_address: string
  dropoff_lat: number
  dropoff_lng: number
  scheduled_at: string
  distance_km: number
  duration_sec: number
  channel?: string
  partner?: string
  client_price?: number
  driver_price?: number
}

export function createApiClient(token: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({})) as { message?: string }
      throw new Error(payload.message ?? `Request failed (${res.status})`)
    }
    return res.json() as Promise<T>
  }

  return {
    bookings: {
      list: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : ''
        return req<{ data: Booking[] }>('GET', `/bookings${qs}`)
      },
      listMarketplace: () =>
        req<{ data: Booking[] }>('GET', '/bookings/marketplace'),
      get: (id: string) =>
        req<{ data: Booking }>('GET', `/bookings/${id}`),
      create: (body: CreateBookingBody) =>
        req<{ data: Booking }>('POST', '/bookings', body),
      confirm: (id: string) =>
        req<{ data: Booking }>('PATCH', `/bookings/${id}/confirm`),
      cancel: (id: string, reason?: string) =>
        req<{ data: Booking }>('PATCH', `/bookings/${id}/cancel`, { cancellation_reason: reason }),
      assignOperator: (id: string, operator_id?: string) =>
        req<{ data: Booking }>('PATCH', `/bookings/${id}/assign-operator`,
          operator_id ? { operator_id } : {}),
    },
    trips: {
      list: () => req<{ data: Trip[] }>('GET', '/trips'),
      get: (id: string) => req<{ data: Trip }>('GET', `/trips/${id}`),
      start: (id: string) => req<{ success: boolean; data: Trip }>('POST', `/trips/${id}/start`),
      complete: (id: string) => req<{ success: boolean; data: Trip }>('POST', `/trips/${id}/complete`),
    },
    drivers: {
      list: () => req<{ data: Driver[] }>('GET', '/drivers'),
      available: (segment?: string) => {
        const qs = segment ? `?segment=${encodeURIComponent(segment)}` : ''
        return req<{ data: Driver[]; count: number }>('GET', `/drivers/available${qs}`)
      },
      availableFor: (bookingId: string) =>
        req<{ success: boolean; data: Driver[]; meta: DispatchMeta }>('GET', `/dispatch/available-drivers/${bookingId}`),
      setAvailability: (id: string, status: DriverAvailability) =>
        req<{ data: Driver }>('PATCH', `/drivers/${id}/availability`, { availability_status: status }),
    },
    vehicles: {
      list: () => req<{ data: Vehicle[] }>('GET', '/vehicles'),
    },
    dispatch: {
      assign: (booking_id: string, driver_id: string, vehicle_id: string) =>
        req<{ data: Trip }>('POST', '/dispatch/assign', { booking_id, driver_id, vehicle_id }),
      unassign: (tripId: string) =>
        req<{ message: string }>('DELETE', `/dispatch/trips/${tripId}/unassign`),
    },
    operators: {
      health: (operatorId: string) =>
        req<{ data: OperatorHealth }>('GET', `/operators/${operatorId}/health`),
    },
    assignments: {
      list: () =>
        req<{ data: Assignment[] }>('GET', '/assignments'),
      create: (body: { driver_id: string; vehicle_id: string; is_primary: boolean }) =>
        req<{ data: Assignment }>('POST', '/assignments', body),
      setPrimary: (id: string) =>
        req<{ data: Assignment }>('PATCH', `/assignments/${id}/set-primary`),
      remove: (id: string) =>
        req<{ message: string }>('DELETE', `/assignments/${id}`),
    },
    segments: {
      list: () =>
        req<{ data: Segment[] }>('GET', '/segments'),
    },
    marketplace: {
      listOperators: () =>
        req<{ data: MarketplaceOperator[] }>('GET', '/marketplace/operators'),
      listRequests: (segment?: string) => {
        const qs = segment ? `?segment=${encodeURIComponent(segment)}` : ''
        return req<{ data: MarketplaceBooking[] }>('GET', `/marketplace/requests${qs}`)
      },
      acceptRequest: (id: string) =>
        req<{ data: MarketplaceBooking }>('POST', `/marketplace/requests/${id}/accept`),
      listJobs: (segment?: string) => {
        const qs = segment ? `?segment=${encodeURIComponent(segment)}` : ''
        return req<{ data: MarketplaceBooking[] }>('GET', `/marketplace/jobs${qs}`)
      },
      claimJob: (id: string) =>
        req<{ data: unknown }>('POST', `/marketplace/jobs/${id}/claim`),
      listAffiliations: () =>
        req<{ data: DriverAffiliation[] }>('GET', '/marketplace/affiliations'),
      requestAffiliation: (operator_id: string, note?: string | null) =>
        req<{ data: DriverAffiliation }>('POST', '/marketplace/affiliations', { operator_id, note }),
      updateAffiliation: (id: string, status: string, commission_pct?: number | null) =>
        req<{ data: DriverAffiliation }>('PATCH', `/marketplace/affiliations/${id}`, { status, commission_pct }),
      listFavorites: () =>
        req<{ data: ClientFavorite[] }>('GET', '/marketplace/favorites'),
      addFavorite: (driver_id: string) =>
        req<{ data: ClientFavorite }>('POST', '/marketplace/favorites', { driver_id }),
      removeFavorite: (driver_id: string) =>
        req<void>('DELETE', `/marketplace/favorites/${driver_id}`),
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
