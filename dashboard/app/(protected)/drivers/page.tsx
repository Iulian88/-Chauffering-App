'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/auth-context'
import { createApiClient, type Driver } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'

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
        <SkeletonTable cols={5} />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : drivers.length === 0 ? (
        <EmptyState label="No drivers registered" sub="Add drivers through the onboarding flow" />
      ) : (
        <div className="mt-6 rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card border-b border-border">
                {['Name', 'License', 'Vehicle', 'Segment', 'Status'].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
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
                      <StatusBadge status={driver.availability_status} />
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
