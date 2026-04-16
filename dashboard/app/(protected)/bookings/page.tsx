'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/auth-context'
import { createApiClient, type Booking } from '@/lib/api'
import { BookingsTable } from '@/components/bookings/BookingsTable'
import { MarketplaceTable } from '@/components/bookings/MarketplaceTable'
import { DispatchModal } from '@/components/bookings/DispatchModal'
import { CreateBookingModal } from '@/components/bookings/CreateBookingModal'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'

type Tab = 'my-bookings' | 'marketplace'

export default function BookingsPage() {
  const { token } = useAuth()
  const api = token ? createApiClient(token) : null

  const [tab, setTab]                       = useState<Tab>('my-bookings')
  const [bookings, setBookings]             = useState<Booking[]>([])
  const [poolBookings, setPoolBookings]     = useState<Booking[]>([])
  const [loading, setLoading]               = useState(true)
  const [poolLoading, setPoolLoading]       = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [poolError, setPoolError]           = useState<string | null>(null)
  const [dispatchId, setDispatchId]         = useState<string | null>(null)
  const [showCreate, setShowCreate]         = useState(false)

  const fetchBookings = useCallback(async () => {
    if (!api) return
    setError(null)
    try {
      const { data } = await api.bookings.list()
      setBookings(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPoolBookings = useCallback(async () => {
    if (!api) return
    setPoolError(null)
    try {
      const { data } = await api.bookings.listMarketplace()
      setPoolBookings(data)
    } catch (e) {
      setPoolError(e instanceof Error ? e.message : 'Failed to load marketplace jobs')
    } finally {
      setPoolLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchBookings() }, [fetchBookings])
  useEffect(() => { fetchPoolBookings() }, [fetchPoolBookings])

  const handleConfirm = async (id: string) => {
    if (!api) return
    await api.bookings.confirm(id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'confirmed' } : b))
  }

  const handleDispatchComplete = () => {
    setDispatchId(null)
    setLoading(true)
    fetchBookings()
  }

  const handleAcceptJob = async (id: string) => {
    if (!api) return
    await api.bookings.assignOperator(id)
    // Remove from pool immediately; refresh own bookings so it appears there
    setPoolBookings(prev => prev.filter(b => b.id !== id))
    setLoading(true)
    fetchBookings()
  }

  const pending   = bookings.filter(b => b.status === 'pending').length
  const confirmed = bookings.filter(b => b.status === 'confirmed').length

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Bookings"
        subtitle="Manage incoming requests and dispatch assignments"
        count={tab === 'my-bookings' ? bookings.length : poolBookings.length}
        actions={
          <div className="flex items-center gap-3">
            {tab === 'my-bookings' && pending > 0 && (
              <span className="text-xs text-secondary bg-card border border-border px-3 py-1.5 rounded-md">
                {pending} pending · {confirmed} confirmed
              </span>
            )}
            {tab === 'marketplace' && poolBookings.length > 0 && (
              <span className="text-xs text-secondary bg-card border border-border px-3 py-1.5 rounded-md">
                {poolBookings.length} open {poolBookings.length === 1 ? 'job' : 'jobs'}
              </span>
            )}
            {tab === 'my-bookings' && (
              <button
                onClick={() => setShowCreate(true)}
                className="text-xs font-semibold bg-accent text-[#0B0B0C] px-4 py-1.5 rounded-lg hover:bg-accent/90 transition-colors"
              >
                + Add Booking
              </button>
            )}
          </div>
        }
      />

      {/* Tab switcher */}
      <div className="mt-6 flex items-center gap-1 border-b border-border">
        <TabButton active={tab === 'my-bookings'} onClick={() => setTab('my-bookings')}>
          My Bookings
        </TabButton>
        <TabButton active={tab === 'marketplace'} onClick={() => setTab('marketplace')}>
          Marketplace Jobs
          {poolBookings.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-semibold bg-accent text-[#0B0B0C]">
              {poolBookings.length}
            </span>
          )}
        </TabButton>
      </div>

      {/* My Bookings tab */}
      {tab === 'my-bookings' && (
        loading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => { setLoading(true); fetchBookings() }} />
        ) : (
          <BookingsTable
            bookings={bookings}
            onConfirm={handleConfirm}
            onDispatch={id => setDispatchId(id)}
          />
        )
      )}

      {/* Marketplace tab */}
      {tab === 'marketplace' && (
        poolLoading ? (
          <TableSkeleton />
        ) : poolError ? (
          <ErrorState message={poolError} onRetry={() => { setPoolLoading(true); fetchPoolBookings() }} />
        ) : api ? (
          <MarketplaceTable
            bookings={poolBookings}
            api={api}
            onAccept={handleAcceptJob}
          />
        ) : null
      )}

      {dispatchId && api && (
        <DispatchModal
          bookingId={dispatchId}
          api={api}
          onClose={() => setDispatchId(null)}
          onSuccess={handleDispatchComplete}
        />
      )}

      {showCreate && api && (
        <CreateBookingModal
          api={api}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            setLoading(true)
            fetchBookings()
          }}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'border-accent text-primary'
          : 'border-transparent text-secondary hover:text-primary hover:border-border',
      )}
    >
      {children}
    </button>
  )
}

function TableSkeleton() {
  return (
    <div className="mt-6 rounded-xl border border-border overflow-hidden">
      <div className="bg-card border-b border-border h-11" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[3.75rem] border-b border-border/40 bg-base flex items-center px-5 gap-6">
          {[160, 140, 80, 110, 70, 70, 100].map((w, j) => (
            <div key={j} className={`h-3 rounded bg-card animate-pulse`} style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-red-900/30 bg-red-950/10 px-6 py-8 text-center">
      <p className="text-sm text-red-400/80 mb-3">{message}</p>
      <button
        onClick={onRetry}
        className="text-xs text-secondary hover:text-primary underline underline-offset-2"
      >
        Try again
      </button>
    </div>
  )
}
