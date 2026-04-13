'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/auth-context'
import { createApiClient, type Trip } from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDateTime } from '@/lib/format'

export default function TripsPage() {
  const { token } = useAuth()
  const api = token ? createApiClient(token) : null

  const [trips, setTrips]   = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  const fetchTrips = useCallback(async () => {
    if (!api) return
    try {
      const { data } = await api.trips.list()
      setTrips(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trips')
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchTrips() }, [fetchTrips])

  const active = trips.filter(t => !['completed', 'cancelled'].includes(t.status)).length

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Trips"
        subtitle="Live and historical journey records"
        count={trips.length}
        actions={
          active > 0 ? (
            <span className="text-xs text-[#4CAF7D] bg-[#0D1E15] border border-[#4CAF7D]/20 px-3 py-1.5 rounded-md">
              {active} active
            </span>
          ) : undefined
        }
      />

      {loading ? (
        <SkeletonTable cols={6} />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : trips.length === 0 ? (
        <EmptyState label="No trips yet" sub="Dispatched bookings will appear here" />
      ) : (
        <div className="mt-6 rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card border-b border-border">
                {['Trip ID', 'Booking', 'Driver ID', 'Status', 'Assigned', 'Completed'].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 bg-base">
              {trips.map(trip => (
                <tr key={trip.id} className="hover:bg-card/60 transition-colors">
                  <td className="px-5 py-4 font-mono text-xs text-secondary">
                    {trip.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-muted">
                    {trip.booking_id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-muted">
                    {trip.driver_id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={trip.status} />
                  </td>
                  <td className="px-5 py-4 text-xs text-secondary tabular-nums">
                    {formatDateTime(trip.assigned_at)}
                  </td>
                  <td className="px-5 py-4 text-xs text-muted tabular-nums">
                    {trip.completed_at ? formatDateTime(trip.completed_at) : '—'}
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
      {Array.from({ length: 5 }).map((_, i) => (
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
