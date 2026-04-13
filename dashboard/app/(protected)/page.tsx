'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { createApiClient, type Booking, type Trip, type Driver } from '@/lib/api'
import { StatCard } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDateTime, formatPrice, truncateAddress } from '@/lib/format'

interface DashboardData {
  bookings: Booking[]
  trips: Trip[]
  drivers: Driver[]
}

export default function DashboardPage() {
  const { token, user } = useAuth()
  const api = token ? createApiClient(token) : null

  const [data, setData]       = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!api) return
    try {
      const [{ data: bookings }, { data: trips }, { data: drivers }] = await Promise.all([
        api.bookings.list(),
        api.trips.list(),
        api.drivers.list(),
      ])
      setData({ bookings, trips, drivers })
    } catch {
      // silently fail — individual pages will show errors
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll() }, [fetchAll])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const activeTrips     = data?.trips.filter(t => !['completed', 'cancelled'].includes(t.status)).length ?? 0
  const availDrivers    = data?.drivers.filter(d => d.availability_status === 'available').length ?? 0
  const totalBookings   = data?.bookings.length ?? 0
  const totalRevenue    = data?.bookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + (b.price_final ?? b.price_estimate), 0) ?? 0

  const recentBookings  = data?.bookings.slice().reverse().slice(0, 6) ?? []

  return (
    <div className="px-8 py-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-xl font-light text-primary tracking-wide">
          {greeting}{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}.
        </h1>
        <p className="text-sm text-secondary mt-1">Here's what's happening with your fleet today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-border bg-card animate-pulse" />
          ))
        ) : (
          <>
            <StatCard label="Total Bookings"    value={totalBookings}  sub="all time" />
            <StatCard label="Active Trips"       value={activeTrips}    sub="in progress" />
            <StatCard label="Available Drivers"  value={availDrivers}   sub={`of ${data?.drivers.length ?? 0} total`} />
            <StatCard label="Completed Revenue"  value={formatPrice(totalRevenue)} sub="completed trips" accent />
          </>
        )}
      </div>

      {/* Recent Bookings */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-secondary uppercase tracking-wider">Recent Bookings</h2>
          <Link
            href="/bookings"
            className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="bg-card border-b border-border h-11" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 border-b border-border/40 bg-base flex items-center px-5 gap-6">
                {[180, 150, 90, 80, 80].map((w, j) => (
                  <div key={j} className="h-3 rounded bg-card animate-pulse" style={{ width: w }} />
                ))}
              </div>
            ))}
          </div>
        ) : recentBookings.length === 0 ? (
          <div className="rounded-xl border border-border bg-card flex items-center justify-center h-40">
            <p className="text-sm text-muted">No bookings yet</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-card border-b border-border">
                  {['Pickup', 'Destination', 'Scheduled', 'Price', 'Status'].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 bg-base">
                {recentBookings.map(b => (
                  <tr key={b.id} className="hover:bg-card/60 transition-colors">
                    <td className="px-5 py-3.5 text-xs text-primary">{truncateAddress(b.pickup_address)}</td>
                    <td className="px-5 py-3.5 text-xs text-secondary">{truncateAddress(b.dropoff_address)}</td>
                    <td className="px-5 py-3.5 text-xs text-muted tabular-nums">{formatDateTime(b.scheduled_at)}</td>
                    <td className="px-5 py-3.5 text-xs text-accent tabular-nums font-medium">{formatPrice(b.price_estimate, b.currency)}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
