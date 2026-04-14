'use client'

import { useState, useEffect, useRef, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Loader } from '@googlemaps/js-api-loader'
import type { ApiClient } from '@/lib/api'

interface Props {
  api: ApiClient
  onClose: () => void
  onSuccess: () => void
}

const SEGMENTS = ['ride', 'business', 'executive', 'office_lux', 'prime_lux'] as const
const CHANNELS = ['manual', 'phone', 'app', 'partner', 'website'] as const

export function CreateBookingModal({ api, onClose, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // ─── Maps state ──────────────────────────────────────────────────────────────
  const [mapsReady, setMapsReady]             = useState(false)
  const [pickupLat, setPickupLat]             = useState<number | null>(null)
  const [pickupLng, setPickupLng]             = useState<number | null>(null)
  const [dropoffLat, setDropoffLat]           = useState<number | null>(null)
  const [dropoffLng, setDropoffLng]           = useState<number | null>(null)
  const [fetchingRoute, setFetchingRoute]     = useState(false)
  // When non-null: duration was auto-filled from Distance Matrix (already in seconds).
  // When null: use form.duration_sec × 60 (user entered minutes).
  const [autofilledDurationSec, setAutofilledDurationSec] = useState<number | null>(null)

  const pickupRef  = useRef<HTMLInputElement>(null)
  const dropoffRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    segment:          'business' as typeof SEGMENTS[number],
    pickup_address:   '',
    pickup_notes:     '',
    dropoff_address:  '',
    dropoff_notes:    '',
    scheduled_at:     '',
    distance_km:      '',
    duration_sec:     '',
    client_price:     '',
    driver_price:     '',
    partner:          '',
    channel:          'manual' as string,
  })

  function set(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // ─── Map pin drag handlers ────────────────────────────────────────────────────
  function handlePickupDragEnd(lat: number, lng: number) {
    setPickupLat(lat)
    setPickupLng(lng)
    setAutofilledDurationSec(null)
    setDropoffLat(prevDLat => {
      setDropoffLng(prevDLng => {
        if (prevDLat !== null && prevDLng !== null) calcRoute(lat, lng, prevDLat, prevDLng)
        return prevDLng
      })
      return prevDLat
    })
  }

  function handleDropoffDragEnd(lat: number, lng: number) {
    setDropoffLat(lat)
    setDropoffLng(lng)
    setAutofilledDurationSec(null)
    setPickupLat(prevPLat => {
      setPickupLng(prevPLng => {
        if (prevPLat !== null && prevPLng !== null) calcRoute(prevPLat, prevPLng, lat, lng)
        return prevPLng
      })
      return prevPLat
    })
  }

  // ─── Load Google Maps SDK ────────────────────────────────────────────────────
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) return // key not configured — modal works as plain text inputs

    let mounted = true

    const loader = new Loader({ apiKey, libraries: ['places'], version: 'weekly' })

    loader.load().then(() => {
      if (!mounted) return
      if (!pickupRef.current || !dropoffRef.current) return

      // Bind autocomplete to pickup input
      const pickupAC = new google.maps.places.Autocomplete(pickupRef.current, {
        fields: ['formatted_address', 'geometry'],
      })
      pickupAC.addListener('place_changed', () => {
        const place = pickupAC.getPlace()
        if (!place.geometry?.location) return
        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        setPickupLat(lat)
        setPickupLng(lng)
        setForm(prev => ({ ...prev, pickup_address: place.formatted_address ?? prev.pickup_address }))
        // Trigger route calculation if dropoff is already set — read fresh state via setters
        setDropoffLat(prevDropoffLat => {
          setDropoffLng(prevDropoffLng => {
            if (prevDropoffLat !== null && prevDropoffLng !== null) {
              calcRoute(lat, lng, prevDropoffLat, prevDropoffLng)
            }
            return prevDropoffLng
          })
          return prevDropoffLat
        })
      })

      // Bind autocomplete to dropoff input
      const dropoffAC = new google.maps.places.Autocomplete(dropoffRef.current, {
        fields: ['formatted_address', 'geometry'],
      })
      dropoffAC.addListener('place_changed', () => {
        const place = dropoffAC.getPlace()
        if (!place.geometry?.location) return
        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        setDropoffLat(lat)
        setDropoffLng(lng)
        setForm(prev => ({ ...prev, dropoff_address: place.formatted_address ?? prev.dropoff_address }))
        // Trigger route calculation if pickup is already set
        setPickupLat(prevPickupLat => {
          setPickupLng(prevPickupLng => {
            if (prevPickupLat !== null && prevPickupLng !== null) {
              calcRoute(prevPickupLat, prevPickupLng, lat, lng)
            }
            return prevPickupLng
          })
          return prevPickupLat
        })
      })

      setMapsReady(true)
    }).catch(() => {
      // SDK failed to load — form continues as plain text inputs (current behavior)
    })

    return () => { mounted = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Distance Matrix ─────────────────────────────────────────────────────────
  function calcRoute(
    oLat: number, oLng: number,
    dLat: number, dLng: number,
  ) {
    if (typeof google === 'undefined') return
    setFetchingRoute(true)
    const svc = new google.maps.DistanceMatrixService()
    svc.getDistanceMatrix(
      {
        origins:      [new google.maps.LatLng(oLat, oLng)],
        destinations: [new google.maps.LatLng(dLat, dLng)],
        travelMode:   google.maps.TravelMode.DRIVING,
        unitSystem:   google.maps.UnitSystem.METRIC,
      },
      (result, status) => {
        setFetchingRoute(false)
        if (status !== 'OK' || !result) return // leave fields blank for manual entry
        const element = result.rows[0]?.elements[0]
        if (!element || element.status !== 'OK') return
        const distKm  = Math.round((element.distance.value / 1000) * 10) / 10
        const durSec  = element.duration.value // already in seconds
        const durMin  = Math.round(durSec / 60)
        // duration_sec field shows minutes to the user; autofilledDurationSec holds real seconds
        setAutofilledDurationSec(durSec)
        setForm(prev => ({
          ...prev,
          distance_km:  String(distKm),
          duration_sec: String(durMin),
        }))
      },
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // Block submit if either address was not confirmed via autocomplete
    if (pickupLat === null || pickupLng === null || dropoffLat === null || dropoffLng === null) {
      setError('Please select both pickup and destination from the suggestions')
      return
    }

    setSubmitting(true)
    try {
      // duration_sec: use raw seconds from Distance Matrix if auto-filled,
      // otherwise convert user-entered minutes → seconds.
      const durationSec = autofilledDurationSec !== null
        ? autofilledDurationSec
        : Math.round(Number(form.duration_sec) * 60)

      await api.bookings.create({
        segment:         form.segment,
        pickup_address:  form.pickup_address,
        pickup_lat:      pickupLat  ?? 0,
        pickup_lng:      pickupLng  ?? 0,
        dropoff_address: form.dropoff_address,
        dropoff_lat:     dropoffLat ?? 0,
        dropoff_lng:     dropoffLng ?? 0,
        scheduled_at:    new Date(form.scheduled_at).toISOString(),
        distance_km:     Number(form.distance_km),
        duration_sec:    durationSec,
        channel:         form.channel || undefined,
        partner:         form.partner || undefined,
        client_price:    form.client_price ? Number(form.client_price) : undefined,
        driver_price:    form.driver_price ? Number(form.driver_price) : undefined,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-modal">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-primary tracking-wide">New Booking</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Segment */}
          <Field label="Segment">
            <select
              value={form.segment}
              onChange={e => set('segment', e.target.value)}
              className={inputCls}
              required
            >
              {SEGMENTS.map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </Field>

          {/* Pickup / Dropoff */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pickup address">
              <div className="relative">
                <input
                  ref={pickupRef}
                  type="text"
                  value={form.pickup_address}
                  onChange={e => {
                    set('pickup_address', e.target.value)
                    setPickupLat(null)
                    setPickupLng(null)
                    setAutofilledDurationSec(null)
                  }}
                  className={inputCls + (pickupLat !== null ? ' pr-7' : '')}
                  placeholder="123 Main St"
                  required
                  minLength={5}
                />
                {pickupLat !== null && (
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-emerald-400">✔</span>
                )}
              </div>
              {pickupLat !== null && pickupLng !== null && mapsReady && (
                <MapPin lat={pickupLat} lng={pickupLng} onDragEnd={handlePickupDragEnd} />
              )}
            </Field>
            <Field label="Destination">
              <div className="relative">
                <input
                  ref={dropoffRef}
                  type="text"
                  value={form.dropoff_address}
                  onChange={e => {
                    set('dropoff_address', e.target.value)
                    setDropoffLat(null)
                    setDropoffLng(null)
                    setAutofilledDurationSec(null)
                  }}
                  className={inputCls + (dropoffLat !== null ? ' pr-7' : '')}
                  placeholder="456 Park Ave"
                  required
                  minLength={5}
                />
                {dropoffLat !== null && (
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-emerald-400">✔</span>
                )}
              </div>
              {dropoffLat !== null && dropoffLng !== null && mapsReady && (
                <MapPin lat={dropoffLat} lng={dropoffLng} onDragEnd={handleDropoffDragEnd} />
              )}
            </Field>
          </div>

          {/* Pickup / Dropoff notes */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pickup notes">
              <input
                type="text"
                value={form.pickup_notes}
                onChange={e => set('pickup_notes', e.target.value)}
                className={inputCls}
                placeholder="Entrance, apartment, instructions…"
              />
            </Field>
            <Field label="Dropoff notes">
              <input
                type="text"
                value={form.dropoff_notes}
                onChange={e => set('dropoff_notes', e.target.value)}
                className={inputCls}
                placeholder="Entrance, apartment, instructions…"
              />
            </Field>
          </div>

          {/* Scheduled at */}
          <Field label="Scheduled at">
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={e => set('scheduled_at', e.target.value)}
              className={inputCls}
              required
            />
          </Field>

          {/* Distance / Duration */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Distance (km)">
              <input
                type="number"
                value={form.distance_km}
                onChange={e => set('distance_km', e.target.value)}
                className={inputCls}
                placeholder="12"
                min="0.1"
                step="0.1"
                required
              />
            </Field>
            <Field label="Duration (min)">
              <input
                type="number"
                value={form.duration_sec}
                onChange={e => {
                  set('duration_sec', e.target.value)
                  setAutofilledDurationSec(null)
                }}
                className={inputCls}
                placeholder="30"
                min="1"
                step="1"
                required
              />
            </Field>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client price">
              <input
                type="number"
                value={form.client_price}
                onChange={e => set('client_price', e.target.value)}
                className={inputCls}
                placeholder="120.00"
                min="0"
                step="0.01"
              />
            </Field>
            <Field label="Driver price">
              <input
                type="number"
                value={form.driver_price}
                onChange={e => set('driver_price', e.target.value)}
                className={inputCls}
                placeholder="90.00"
                min="0"
                step="0.01"
              />
            </Field>
          </div>

          {/* Partner / Channel */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Partner">
              <input
                type="text"
                value={form.partner}
                onChange={e => set('partner', e.target.value)}
                className={inputCls}
                placeholder="internal"
              />
            </Field>
            <Field label="Channel">
              <select
                value={form.channel}
                onChange={e => set('channel', e.target.value)}
                className={inputCls}
              >
                {CHANNELS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Profit preview */}
          {form.client_price && form.driver_price && (
            <div className="rounded-lg bg-base border border-border px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-muted">Estimated profit</span>
              <span className="text-xs font-semibold text-accent tabular-nums">
                {(Number(form.client_price) - Number(form.driver_price)).toFixed(2)}
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/25 px-3.5 py-3">
              <p className="text-xs text-red-400/90">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-secondary hover:text-primary border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold bg-accent text-[#0B0B0C] rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? 'Creating…' : 'Create Booking'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-base border border-border rounded-lg px-3 py-2 text-sm text-primary ' +
  'placeholder:text-muted/50 focus:border-accent/40 focus:ring-1 focus:ring-accent/20 ' +
  'transition-colors outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-2xs font-medium text-muted uppercase tracking-widest">
        {label}
      </label>
      {children}
    </div>
  )
}

// ─── MapPin ───────────────────────────────────────────────────────────────────

function MapPin({
  lat,
  lng,
  onDragEnd,
}: {
  lat: number
  lng: number
  onDragEnd: (lat: number, lng: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || typeof google === 'undefined') return
    const map = new google.maps.Map(containerRef.current, {
      center:           { lat, lng },
      zoom:             17,
      disableDefaultUI: true,
      zoomControl:      true,
    })
    const marker = new google.maps.Marker({
      position:  { lat, lng },
      map,
      draggable: true,
    })
    marker.addListener('dragend', () => {
      const pos = marker.getPosition()
      if (pos) onDragEnd(pos.lat(), pos.lng())
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // lat/lng intentionally omitted — component remounts via parent conditional when coords reset

  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-2xs text-muted/60">Drag pin to adjust exact location</p>
      <div
        ref={containerRef}
        className="h-[180px] w-full rounded-lg overflow-hidden border border-border"
      />
    </div>
  )
}
