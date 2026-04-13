'use client'

import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
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

  const [form, setForm] = useState({
    segment:          'business' as typeof SEGMENTS[number],
    pickup_address:   '',
    dropoff_address:  '',
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.bookings.create({
        segment:         form.segment,
        pickup_address:  form.pickup_address,
        pickup_lat:      0,
        pickup_lng:      0,
        dropoff_address: form.dropoff_address,
        dropoff_lat:     0,
        dropoff_lng:     0,
        scheduled_at:    new Date(form.scheduled_at).toISOString(),
        distance_km:     Number(form.distance_km),
        duration_sec:    Math.round(Number(form.duration_sec) * 60),
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
              <input
                type="text"
                value={form.pickup_address}
                onChange={e => set('pickup_address', e.target.value)}
                className={inputCls}
                placeholder="123 Main St"
                required
                minLength={5}
              />
            </Field>
            <Field label="Destination">
              <input
                type="text"
                value={form.dropoff_address}
                onChange={e => set('dropoff_address', e.target.value)}
                className={inputCls}
                placeholder="456 Park Ave"
                required
                minLength={5}
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
                onChange={e => set('duration_sec', e.target.value)}
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
