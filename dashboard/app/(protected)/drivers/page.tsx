'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/auth-context'
import { createApiClient, type Driver, type DriverAvailability, type ApiClient } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'

// ─── Availability select ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DriverAvailability, { label: string; color: string; bg: string; border: string }> = {
  available: { label: 'Available', color: 'text-[#4CAF7D]', bg: 'bg-[#0D1E15]',  border: 'border-[#4CAF7D]/30' },
  busy:      { label: 'On Trip',   color: 'text-accent',    bg: 'bg-accent-muted', border: 'border-accent/30' },
  offline:   { label: 'Offline',   color: 'text-[#8A8A94]', bg: 'bg-[#18181C]',   border: 'border-[#8A8A94]/20' },
}

function AvailabilitySelect({
  driverId,
  current,
  api,
  onUpdated,
}: {
  driverId: string
  current: DriverAvailability
  api: ApiClient
  onUpdated: (id: string, status: DriverAvailability) => void
}) {
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const cfg = STATUS_CONFIG[current]

  async function handleChange(next: DriverAvailability) {
    if (next === current || saving) return
    setSaving(true)
    setErr(null)
    try {
      const { data } = await api.drivers.setAvailability(driverId, next)
      onUpdated(driverId, data.availability_status)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <div className={[
        'relative flex items-center gap-1.5 rounded-md px-2.5 py-1 border text-xs font-medium transition-opacity',
        cfg.color, cfg.bg, cfg.border,
        saving ? 'opacity-50' : '',
      ].join(' ')}>
        {saving && (
          <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin shrink-0" />
        )}
        <select
          disabled={saving}
          value={current}
          onChange={e => handleChange(e.target.value as DriverAvailability)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
          aria-label="Set driver availability"
        >
          {(Object.keys(STATUS_CONFIG) as DriverAvailability[]).map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        <span>{cfg.label}</span>
        <svg className="w-3 h-3 opacity-60 shrink-0" viewBox="0 0 12 12" fill="currentColor">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {err && <p className="text-[10px] text-red-400 leading-tight max-w-[140px]">{err}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DriversPage() {
  const { token } = useAuth()
  const api = token ? createApiClient(token) : null

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchDrivers = useCallback(async () => {
    if (!api) return
    try {
      const { data } = await api.drivers.list()
      setDrivers(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load drivers')
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchDrivers() }, [fetchDrivers])

  // Optimistic update — replace driver's status in local state immediately on success
  function handleAvailabilityUpdated(id: string, status: DriverAvailability) {
    setDrivers(prev => prev.map(d => d.id === id ? { ...d, availability_status: status } : d))
  }

  const available = drivers.filter(d => d.availability_status === 'available').length

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Drivers"
        subtitle="Fleet personnel and availability"
        count={drivers.length}
        actions={
          available > 0 ? (
            <span className="text-xs text-[#4CAF7D] bg-[#0D1E15] border border-[#4CAF7D]/20 px-3 py-1.5 rounded-md">
              {available} available
            </span>
          ) : undefined
        }
      />

      {loading ? (
        <SkeletonTable cols={6} />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : drivers.length === 0 ? (
        <EmptyState label="No drivers registered" sub="Add drivers through the onboarding flow" />
      ) : (
        <div className="mt-6 rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card border-b border-border">
                {['Name', 'License', 'Vehicle', 'Segment', 'Status', ''].map((h, i) => (
                  <th key={i} className="text-left px-5 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 bg-base">
              {drivers.map(driver => {
                const vehicle = driver.vehicles?.[0]
                const name = driver.user_profiles?.full_name ?? `Driver ${driver.id.slice(0, 6)}`
                return (
                  <tr key={driver.id} className="hover:bg-card/60 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-sm text-primary font-medium">{name}</p>
                      <p className="text-xs text-muted mt-0.5">{driver.user_profiles?.phone ?? '—'}</p>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-secondary">{driver.license_number}</td>
                    <td className="px-5 py-4">
                      {vehicle ? (
                        <div>
                          <p className="text-xs text-primary">{vehicle.plate}</p>
                          <p className="text-xs text-muted mt-0.5">{vehicle.make} {vehicle.model}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-muted capitalize">
                      {vehicle?.segment ?? '—'}
                    </td>
                    <td className="px-5 py-4">
                      {api ? (
                        <AvailabilitySelect
                          driverId={driver.id}
                          current={driver.availability_status}
                          api={api}
                          onUpdated={handleAvailabilityUpdated}
                        />
                      ) : (
                        <span className="text-xs text-muted">{driver.availability_status}</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {driver.availability_status !== 'available' && (
                        <span className="text-[10px] text-amber-400/70">
                          unavailable for dispatch
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SkeletonTable({ cols }: { cols: number }) {
  return (
    <div className="mt-6 rounded-xl border border-border overflow-hidden">
      <div className="bg-card border-b border-border h-11" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 border-b border-border/40 bg-base flex items-center px-5 gap-8">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-3 rounded bg-card animate-pulse flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

function EmptyState({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-card flex flex-col items-center justify-center h-64 gap-2">
      <p className="text-sm text-secondary">{label}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-xl border border-red-900/30 bg-red-950/10 px-6 py-6">
      <p className="text-sm text-red-400/80">{message}</p>
    </div>
  )
}
