'use client'

import { useState } from 'react'
import { type Booking } from '@/lib/api'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { formatDateTime, formatPrice, truncateAddress, segmentLabel } from '@/lib/format'

interface Props {
  bookings: Booking[]
  onConfirm: (id: string) => Promise<void>
  onDispatch: (id: string) => void
}

export function BookingsTable({ bookings, onConfirm, onDispatch }: Props) {
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set())

  async function handleConfirm(id: string) {
    setConfirmingIds(prev => new Set(prev).add(id))
    try {
      await onConfirm(id)
    } finally {
      setConfirmingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  if (bookings.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card flex flex-col items-center justify-center h-64 gap-2">
        <p className="text-sm text-secondary">No bookings found</p>
        <p className="text-xs text-muted">Incoming requests will appear here</p>
      </div>
    )
  }

  return (
    <div className="mt-6 rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-card border-b border-border">
            <Th>Pickup</Th>
            <Th>Destination</Th>
            <Th>Segment</Th>
            <Th>Scheduled</Th>
            <Th right>Price</Th>
            <Th center>Status</Th>
            <Th right>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40 bg-base">
          {bookings.map(booking => (
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
                <div className="flex items-center justify-end gap-1.5">
                  {booking.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={confirmingIds.has(booking.id)}
                      onClick={() => handleConfirm(booking.id)}
                    >
                      Confirm
                    </Button>
                  )}
                  {booking.status === 'confirmed' && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onDispatch(booking.id)}
                    >
                      Dispatch
                    </Button>
                  )}
                  {!['pending', 'confirmed'].includes(booking.status) && (
                    <span className="text-xs text-muted px-2">—</span>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <th className={`px-5 py-3.5 text-xs font-medium text-muted uppercase tracking-wider ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <td className={`px-5 py-4 ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>
      {children}
    </td>
  )
}
