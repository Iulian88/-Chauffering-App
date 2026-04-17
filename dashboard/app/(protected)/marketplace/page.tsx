'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/auth-context'
import {
  createApiClient,
  type MarketplaceBooking,
  type ClientFavorite,
  type DriverAffiliation,
} from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { formatDateTime, formatPrice, segmentLabel, truncateAddress } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MapPin, Star, StarOff, Loader2 } from 'lucide-react'

// ─── Shared sub-components ────────────────────────────────────────────────────

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <tbody>
      {[...Array(4)].map((_, i) => (
        <tr key={i} className="border-b border-border/50">
          {[...Array(cols)].map((__, j) => (
            <td key={j} className="py-4 pr-6">
              <div className="h-3 bg-border rounded animate-pulse" style={{ width: `${60 + (j * 15) % 40}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-muted">{message}</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-12 text-center space-y-3">
      <p className="text-sm text-red-400">{message}</p>
      <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  )
}

// ─── Section: Operator — open marketplace requests ───────────────────────────

function RequestsSection() {
  const { token } = useAuth()
  const api = token ? createApiClient(token) : null
  const [requests, setRequests] = useState<MarketplaceBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!api) return
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.marketplace.listRequests()
      setRequests(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const handleAccept = async (id: string) => {
    if (!api) return
    setAccepting(id)
    try {
      await api.marketplace.acceptRequest(id)
      setRequests(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to accept request')
    } finally {
      setAccepting(null)
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-primary">Open Client Requests</h2>
          <p className="text-xs text-muted mt-0.5">First operator to accept wins — race-safe</p>
        </div>
        {!loading && (
          <span className="text-xs text-muted tabular-nums">
            {requests.length} open {requests.length === 1 ? 'request' : 'requests'}
          </span>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 pb-3 pt-4 text-xs text-muted font-medium uppercase tracking-wider">Route</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Segment</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Scheduled</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Status</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Client price</th>
                <th className="pb-3 pt-4 pr-5" />
              </tr>
            </thead>
            {loading ? (
              <TableSkeleton cols={6} />
            ) : requests.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6}>
                    <EmptyState message="No open requests at the moment." />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-border/50">
                {requests.map(r => (
                  <tr key={r.id} className="group hover:bg-border-subtle/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-start gap-2">
                        <MapPin size={13} className="text-muted mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-primary font-medium leading-snug">{truncateAddress(r.pickup_address)}</p>
                          <p className="text-muted text-xs mt-0.5">→ {truncateAddress(r.dropoff_address)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 pr-5 text-secondary">{segmentLabel(r.segment)}</td>
                    <td className="py-3.5 pr-5 text-secondary tabular-nums text-xs">{formatDateTime(r.scheduled_at)}</td>
                    <td className="py-3.5 pr-5"><StatusBadge status={r.status} /></td>
                    <td className="py-3.5 pr-5 text-secondary tabular-nums">
                      {r.client_price != null ? formatPrice(r.client_price, r.currency) : '—'}
                    </td>
                    <td className="py-3.5 pr-5">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={accepting === r.id}
                        onClick={() => handleAccept(r.id)}
                      >
                        Accept
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        )}
      </div>
    </section>
  )
}

// ─── Section: Driver — job board ─────────────────────────────────────────────

function JobsSection() {
  const { token } = useAuth()
  const api = token ? createApiClient(token) : null
  const [jobs, setJobs] = useState<MarketplaceBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!api) return
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.marketplace.listJobs()
      setJobs(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const handleClaim = async (id: string) => {
    if (!api) return
    setClaiming(id)
    try {
      await api.marketplace.claimJob(id)
      setJobs(prev => prev.filter(j => j.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to claim job')
    } finally {
      setClaiming(null)
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-primary">Available Jobs</h2>
          <p className="text-xs text-muted mt-0.5">Claim a job to auto-create your trip assignment</p>
        </div>
        {!loading && (
          <span className="text-xs text-muted tabular-nums">
            {jobs.length} available
          </span>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 pb-3 pt-4 text-xs text-muted font-medium uppercase tracking-wider">Route</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Segment</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Scheduled</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Distance</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Your price</th>
                <th className="pb-3 pt-4 pr-5" />
              </tr>
            </thead>
            {loading ? (
              <TableSkeleton cols={6} />
            ) : jobs.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6}>
                    <EmptyState message="No jobs available right now. Check back soon." />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-border/50">
                {jobs.map(j => (
                  <tr key={j.id} className="group hover:bg-border-subtle/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-start gap-2">
                        <MapPin size={13} className="text-muted mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-primary font-medium leading-snug">{truncateAddress(j.pickup_address)}</p>
                          <p className="text-muted text-xs mt-0.5">→ {truncateAddress(j.dropoff_address)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 pr-5 text-secondary">{segmentLabel(j.segment)}</td>
                    <td className="py-3.5 pr-5 text-secondary tabular-nums text-xs">{formatDateTime(j.scheduled_at)}</td>
                    <td className="py-3.5 pr-5 text-secondary tabular-nums">{j.distance_km.toFixed(1)} km</td>
                    <td className="py-3.5 pr-5 text-secondary tabular-nums">
                      {/* driver_price is stripped server-side for driver role — show estimate */}
                      {j.driver_price != null ? formatPrice(j.driver_price, j.currency) : '—'}
                    </td>
                    <td className="py-3.5 pr-5">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={claiming === j.id}
                        onClick={() => handleClaim(j.id)}
                      >
                        Claim
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        )}
      </div>
    </section>
  )
}

// ─── Section: Client — favorite drivers ──────────────────────────────────────

function FavoritesSection() {
  const { token } = useAuth()
  const api = token ? createApiClient(token) : null
  const [favorites, setFavorites] = useState<ClientFavorite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!api) return
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.marketplace.listFavorites()
      setFavorites(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load favorites')
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const handleRemove = async (driver_id: string) => {
    if (!api) return
    setRemoving(driver_id)
    try {
      await api.marketplace.removeFavorite(driver_id)
      setFavorites(prev => prev.filter(f => f.driver_id !== driver_id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-primary">Favourite Drivers</h2>
          <p className="text-xs text-muted mt-0.5">Drivers you&apos;ve saved for quick rebooking</p>
        </div>
        {!loading && (
          <span className="text-xs text-muted tabular-nums">
            {favorites.length} saved
          </span>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <table className="w-full text-sm">
            <TableSkeleton cols={4} />
          </table>
        ) : favorites.length === 0 ? (
          <EmptyState message="You haven't saved any favourite drivers yet." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 pb-3 pt-4 text-xs text-muted font-medium uppercase tracking-wider">Driver ID</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Country</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Status</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Added</th>
                <th className="pb-3 pt-4 pr-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {favorites.map(f => (
                <tr key={f.id} className="group hover:bg-border-subtle/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Star size={12} className="text-[#D4A853] flex-shrink-0" />
                      <span className="text-secondary font-mono text-xs">{f.driver_id.slice(0, 8)}…</span>
                    </div>
                  </td>
                  <td className="py-3.5 pr-5 text-secondary text-xs">{f.license_country ?? '—'}</td>
                  <td className="py-3.5 pr-5">
                    {f.availability_status
                      ? <StatusBadge status={f.availability_status} />
                      : <span className="text-muted text-xs">—</span>}
                  </td>
                  <td className="py-3.5 pr-5 text-muted tabular-nums text-xs">{formatDateTime(f.created_at)}</td>
                  <td className="py-3.5 pr-5">
                    <button
                      disabled={removing === f.driver_id}
                      onClick={() => handleRemove(f.driver_id)}
                      className="flex items-center gap-1.5 text-xs text-muted hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {removing === f.driver_id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <StarOff size={12} />}
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

// ─── Platform admin: Affiliations overview ───────────────────────────────────

function AffiliationsSection() {
  const { token } = useAuth()
  const api = token ? createApiClient(token) : null
  const [affiliations, setAffiliations] = useState<DriverAffiliation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!api) return
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.marketplace.listAffiliations()
      setAffiliations(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load affiliations')
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const handleStatus = async (id: string, status: 'active' | 'suspended') => {
    if (!api) return
    setUpdating(id)
    try {
      const { data } = await api.marketplace.updateAffiliation(id, status)
      setAffiliations(prev => prev.map(a => a.id === id ? data : a))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-primary">Driver Affiliations</h2>
          <p className="text-xs text-muted mt-0.5">Approve or suspend self-employed driver affiliations</p>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 pb-3 pt-4 text-xs text-muted font-medium uppercase tracking-wider">Driver</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Operator</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Commission</th>
                <th className="pb-3 pt-4 pr-5 text-xs text-muted font-medium uppercase tracking-wider">Status</th>
                <th className="pb-3 pt-4 pr-5" />
              </tr>
            </thead>
            {loading ? (
              <TableSkeleton cols={5} />
            ) : affiliations.length === 0 ? (
              <tbody>
                <tr><td colSpan={5}><EmptyState message="No affiliations found." /></td></tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-border/50">
                {affiliations.map(a => (
                  <tr key={a.id} className="group hover:bg-border-subtle/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-secondary">{a.driver_license ?? a.driver_id.slice(0, 8) + '…'}</td>
                    <td className="py-3.5 pr-5 text-secondary text-xs">{a.operator_name ?? '—'}</td>
                    <td className="py-3.5 pr-5 text-secondary tabular-nums text-xs">
                      {a.commission_pct != null ? `${a.commission_pct}%` : '—'}
                    </td>
                    <td className="py-3.5 pr-5"><StatusBadge status={a.status} /></td>
                    <td className="py-3.5 pr-5">
                      <div className="flex items-center gap-2">
                        {a.status !== 'active' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={updating === a.id}
                            onClick={() => handleStatus(a.id, 'active')}
                          >
                            Approve
                          </Button>
                        )}
                        {a.status !== 'suspended' && (
                          <Button
                            variant="danger"
                            size="sm"
                            loading={updating === a.id}
                            onClick={() => handleStatus(a.id, 'suspended')}
                          >
                            Suspend
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        )}
      </div>
    </section>
  )
}

// ─── Tab bar (platform admin / superadmin) ────────────────────────────────────

type AdminTab = 'requests' | 'jobs' | 'affiliations'

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-secondary hover:text-primary'
      )}
    >
      {children}
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  const [adminTab, setAdminTab] = useState<AdminTab>('requests')

  const isOperator  = role === 'operator_admin' || role === 'operator_dispatcher'
  const isDriver    = role === 'driver'
  const isClient    = role === 'client'
  const isPlatform  = role === 'platform_admin' || role === 'superadmin'

  const subtitle =
    isOperator ? 'Browse and accept open client requests' :
    isDriver   ? 'Browse and claim available jobs' :
    isClient   ? 'Manage your favourite drivers' :
    isPlatform ? 'Full marketplace overview' :
    'Marketplace'

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Marketplace"
        subtitle={subtitle}
      />

      {/* Operator view */}
      {isOperator && <RequestsSection />}

      {/* Driver view */}
      {isDriver && <JobsSection />}

      {/* Client view */}
      {isClient && <FavoritesSection />}

      {/* Platform admin / superadmin — tabbed overview */}
      {isPlatform && (
        <div>
          <div className="flex items-center gap-0 border-b border-border mb-8">
            <TabBtn active={adminTab === 'requests'} onClick={() => setAdminTab('requests')}>
              Client Requests
            </TabBtn>
            <TabBtn active={adminTab === 'jobs'} onClick={() => setAdminTab('jobs')}>
              Driver Jobs
            </TabBtn>
            <TabBtn active={adminTab === 'affiliations'} onClick={() => setAdminTab('affiliations')}>
              Affiliations
            </TabBtn>
          </div>
          {adminTab === 'requests'     && <RequestsSection />}
          {adminTab === 'jobs'         && <JobsSection />}
          {adminTab === 'affiliations' && <AffiliationsSection />}
        </div>
      )}
    </div>
  )
}
