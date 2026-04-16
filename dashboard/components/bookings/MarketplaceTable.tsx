'use client'

import { useState, useCallback } from 'react'
import { type Booking, type ApiClient } from '@/lib/api'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { formatDateTime, formatPrice, truncateAddress, segmentLabel } from '@/lib/format'

interface Props {
  bookings: Booking[]
  api: ApiClient
  onAccept: (id: string) => Promise<void>
}

// Per-booking availability state
type AvailState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; count: number }
  | { status: 'none' }        // 0 available drivers
  | { status: 'error' }

export function MarketplaceTable({ bookings, api, onAccept }: Props) {
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set())
  // Map of bookingId → availability state
  const [avail, setAvail] = useState<Record<string, AvailState>>({})

  const checkAndAccept = useCallback(async (booking: Booking) => {
    const id = booking.id
    const current = avail[id]

    // Prevent re-entry while a check or accept is already in flight for this row
    if (current?.status === 'checking' || acceptingIds.has(id)) return

    // If we already confirmed drivers are available, accept immediately
    if (current?.status === 'ok') {
      await doAccept(id)
      return
    }

    // Check availability filtered by the booking's segment
    setAvail(prev => ({ ...prev, [id]: { status: 'checking' } }))
    try {
      const { count } = await api.drivers.available(booking.segment)
      if (count === 0) {
        setAvail(prev => ({ ...prev, [id]: { status: 'none' } }))
        return
      }
      setAvail(prev => ({ ...prev, [id]: { status: 'ok', count } }))
      await doAccept(id)
    } catch {
      setAvail(prev => ({ ...prev, [id]: { status: 'error' } }))
    }
  }, [avail, acceptingIds, api]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doAccept(id: string) {
    setAcceptingIds(prev => new Set(prev).add(id))
    try {
      await onAccept(id)
    } finally {
      setAcceptingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  if (bookings.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card flex flex-col items-center justify-center h-64 gap-2">
        <p className="text-sm text-secondary">No open jobs available</p>
        <p className="text-xs text-muted">Unassigned bookings waiting for an operator will appear here</p>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-0 rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-card border-b border-border">
            <Th>Pickup</Th>
            <Th>Destination</Th>
            <Th>Segment</Th>
            <Th>Scheduled</Th>
            <Th right>Estimate</Th>
            <Th center>Status</Th>
            <Th right>Drivers</Th>
            <Th right>Action</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40 bg-base">
          {bookings.map(booking => {
            const state = avail[booking.id] ?? { status: 'idle' }
            const isNoDrivers = state.status === 'none'
            return (
              <>
                <tr key={booking.id} className="group hover:bg-card/60 transition-colors">
                  <Td>
                    <span className="text-primary" title={booking.pickup_address}>
                      {truncateAddress(booking.pickup_address)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-secondary" title={booking.dropoff_address}>
                      {truncateAddress(booking.dropoff_address)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-muted font-medium">
                      {segmentLabel(booking.segment)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-secondary tabular-nums text-xs">
                      {formatDateTime(booking.scheduled_at)}
                    </span>
                  </Td>
                  <Td right>
                    <span className="text-accent font-medium tabular-nums">
                      {formatPrice(booking.price_estimate, booking.currency)}
                    </span>
                  </Td>
                  <Td center>
                    <StatusBadge status={booking.status} />
                  </Td>
                  <Td right>
                    <DriverCountBadge state={state} />
                  </Td>
                  <Td right>
                    <Button
                      size="sm"
                      variant={isNoDrivers ? 'secondary' : 'primary'}
                      loading={state.status === 'checking' || acceptingIds.has(booking.id)}
                      onClick={() => checkAndAccept(booking)}
                    >
                      {isNoDrivers ? 'No Drivers' : 'Accept Job'}
                    </Button>
                  </Td>
                </tr>
                {isNoDrivers && (
                  <tr key={`${booking.id}-warn`}>
                    <td colSpan={8} className="px-5 py-2 bg-amber-950/20 border-t border-amber-900/30">
                      <p className="text-xs text-amber-400/90">
                        No available drivers for this job — assign a driver to your fleet first, or change their status to <strong>available</strong>.
                      </p>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DriverCountBadge({ state }: { state: AvailState }) {
  if (state.status === 'idle') return <span className="text-xs text-muted">—</span>
  if (state.status === 'checking') return <span className="text-xs text-muted animate-pulse">checking…</span>
  if (state.status === 'error') return <span className="text-xs text-red-400">check failed</span>
  if (state.status === 'none') return (
    <span className="text-xs font-semibold text-amber-400">0 avail. (segment match)</span>
  )
  return (
    <span className="text-xs font-semibold text-emerald-400">
      {state.count} avail. (segment match)
    </span>
  )
}

function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <th
      className={[
        'px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap',
        right ? 'text-right' : center ? 'text-center' : 'text-left',
      ].join(' ')}
    >
      {children}
    </th>
  )
}

function Td({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <td
      className={[
        'px-5 py-3.5 whitespace-nowrap',
        right ? 'text-right' : center ? 'text-center' : 'text-left',
      ].join(' ')}
    >
      {children}
    </td>
  )
}


