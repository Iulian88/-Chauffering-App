'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/auth-context'
import { createApiClient, type Vehicle } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { segmentLabel } from '@/lib/format'

export default function VehiclesPage() {
  const { token } = useAuth()
  const api = token ? createApiClient(token) : null

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const fetchVehicles = useCallback(async () => {
    if (!api) return
    try {
      const { data } = await api.vehicles.list()
      setVehicles(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load vehicles')
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchVehicles() }, [fetchVehicles])

  const active = vehicles.filter(v => v.is_active).length

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Fleet"
        subtitle="Vehicle registry and assignments"
        count={vehicles.length}
        actions={
          <span className="text-xs text-secondary bg-card border border-border px-3 py-1.5 rounded-md">
            {active} active
          </span>
        }
      />

      {loading ? (
        <SkeletonTable cols={6} />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : vehicles.length === 0 ? (
        <EmptyState label="No vehicles registered" sub="Add vehicles through the fleet management flow" />
      ) : (
        <div className="mt-6 rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card border-b border-border">
                {['Plate', 'Make & Model', 'Year', 'Segment', 'Driver', 'Status'].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 bg-base">
              {vehicles.map(vehicle => (
                <tr key={vehicle.id} className="hover:bg-card/60 transition-colors">
                  <td className="px-5 py-4 font-mono text-xs text-accent font-medium">
                    {vehicle.plate}
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-primary">{vehicle.make} {vehicle.model}</p>
                    {vehicle.color && (
                      <p className="text-xs text-muted mt-0.5 capitalize">{vehicle.color}</p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-secondary tabular-nums">{vehicle.year}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs text-secondary">{segmentLabel(vehicle.segment)}</span>
                  </td>
                  <td className="px-5 py-4 text-xs text-muted">
                    {vehicle.assigned_driver_id
                      ? <span className="font-mono">{vehicle.assigned_driver_id.slice(0, 8).toUpperCase()}</span>
                      : <span className="text-muted/50 italic">Unassigned</span>
                    }
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      vehicle.is_active
                        ? 'text-[#4CAF7D]'
                        : 'text-muted'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${vehicle.is_active ? 'bg-[#4CAF7D]' : 'bg-muted'}`} />
                      {vehicle.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
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
        <div key={i} className="h-14 border-b border-border/40 bg-base flex items-center px-5 gap-6">
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
