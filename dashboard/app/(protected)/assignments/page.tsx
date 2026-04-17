'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, X, Check } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import {
  createApiClient,
  type Assignment,
  type Driver,
  type Vehicle,
  type ApiClient,
} from '@/lib/api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'

export default function AssignmentsPage() {
  const { token } = useAuth()
  const api = token ? createApiClient(token) : null

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [drivers, setDrivers]         = useState<Driver[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [modalDriver, setModalDriver] = useState<Driver | null>(null)

  const fetchAll = useCallback(async () => {
    if (!api) return
    try {
      const [asRes, drRes] = await Promise.all([
        api.assignments.list(),
        api.drivers.list(),
      ])
      setAssignments(asRes.data)
      setDrivers(drRes.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll() }, [fetchAll])

  // Map driver_id → primary assignment
  const primaryByDriver = new Map(
    assignments
      .filter(a => a.is_primary)
      .map(a => [a.driver_id, a]),
  )

  const driversWithoutAssignment = drivers.filter(d => !primaryByDriver.has(d.id))

  return (
    <div className="px-8 py-8">
      <PageHeader
        title="Assignments"
        subtitle="Manage driver–vehicle pairings"
        count={assignments.length}
        actions={
          <span className="text-xs text-secondary bg-card border border-border px-3 py-1.5 rounded-md">
            {driversWithoutAssignment.length} unassigned
          </span>
        }
      />

      {driversWithoutAssignment.length > 0 && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-3">
          <AlertTriangle size={15} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            <span className="font-semibold">{driversWithoutAssignment.length} driver{driversWithoutAssignment.length > 1 ? 's have' : ' has'} no primary vehicle</span>
            {' '}— they will be excluded from all dispatch pools until assigned.
          </p>
        </div>
      )}

      {loading ? (
        <SkeletonTable />
      ) : error ? (
        <p className="mt-6 text-sm text-red-400">{error}</p>
      ) : drivers.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No drivers found for this operator.</p>
      ) : (
        <div className="mt-6 rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card border-b border-border">
                {['Driver', 'Primary Vehicle', 'Segment', 'Availability', 'Actions'].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 bg-base">
              {drivers.map(driver => {
                const primary = primaryByDriver.get(driver.id)
                const name = driver.user_profiles?.full_name ?? `Driver ${driver.id.slice(0, 6)}`
                const hasVehicle = !!primary?.vehicle
                return (
                  <tr key={driver.id} className="hover:bg-card/60 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-sm text-primary font-medium">{name}</p>
                      <p className="text-xs text-muted mt-0.5 font-mono">{driver.license_number}</p>
                    </td>
                    <td className="px-5 py-4">
                      {hasVehicle ? (
                        <div>
                          <p className="text-sm text-primary font-mono">{primary!.vehicle!.plate}</p>
                          <p className="text-xs text-muted mt-0.5">{primary!.vehicle!.make} {primary!.vehicle!.model}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={12} className="text-amber-400" />
                          <span className="text-xs text-amber-400 font-medium">No vehicle — cannot be dispatched</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-secondary">
                      {primary?.vehicle?.segment ?? <span className="text-muted/50">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <AvailabilityDot status={driver.availability_status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setModalDriver(driver)}
                        >
                          Assign Vehicle
                        </Button>
                        {primary && api && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={async () => {
                              await api.assignments.remove(primary.id)
                              fetchAll()
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalDriver && api && (
        <AssignVehicleModal
          driver={modalDriver}
          api={api}
          onClose={() => setModalDriver(null)}
          onSuccess={() => { setModalDriver(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ─── Availability dot ─────────────────────────────────────────────────────────

function AvailabilityDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    available: { color: 'bg-[#4CAF7D]', label: 'Available' },
    busy:      { color: 'bg-accent',    label: 'On Trip' },
    offline:   { color: 'bg-muted',     label: 'Offline' },
  }
  const cfg = map[status] ?? map['offline']
  return (
    <span className="flex items-center gap-1.5 text-xs text-secondary">
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.color}`} />
      {cfg.label}
    </span>
  )
}

// ─── Assign Vehicle Modal ─────────────────────────────────────────────────────

function AssignVehicleModal({
  driver,
  api,
  onClose,
  onSuccess,
}: {
  driver: Driver
  api: ApiClient
  onClose: () => void
  onSuccess: () => void
}) {
  const [vehicles, setVehicles]     = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [isPrimary, setIsPrimary]   = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const driverName = driver.user_profiles?.full_name ?? `Driver ${driver.id.slice(0, 6)}`

  useEffect(() => {
    api.vehicles.list()
      .then(res => setVehicles(res.data.filter(v => v.is_active)))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load vehicles'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!selectedVehicleId) return
    setSubmitting(true)
    setError(null)
    try {
      await api.assignments.create({
        driver_id: driver.id,
        vehicle_id: selectedVehicleId,
        is_primary: isPrimary,
      })
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create assignment')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-primary">Assign Vehicle</h2>
            <p className="text-xs text-muted mt-0.5">{driverName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-secondary hover:bg-border-subtle transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-secondary uppercase tracking-wider mb-2">
              Select Vehicle
            </label>
            <select
              value={selectedVehicleId}
              onChange={e => setSelectedVehicleId(e.target.value)}
              className="w-full bg-base border border-border rounded-lg px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">— choose a vehicle —</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.make} {v.model} · {v.segment}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setIsPrimary(p => !p)}
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                isPrimary ? 'bg-accent border-accent' : 'bg-base border-border'
              }`}
            >
              {isPrimary && <Check size={10} className="text-[#0B0B0C]" />}
            </div>
            <span className="text-sm text-secondary">Set as primary vehicle</span>
          </label>
          <p className="text-xs text-muted -mt-1">
            Only the primary vehicle is used for dispatch matching.
          </p>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2.5">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedVehicleId}
            loading={submitting}
            onClick={handleSubmit}
          >
            Assign
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonTable() {
  return (
    <div className="mt-6 rounded-xl border border-border overflow-hidden">
      <div className="bg-card border-b border-border h-11" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 border-b border-border/40 bg-base flex items-center px-5 gap-6">
          {Array.from({ length: 5 }).map((_, j) => (
            <div key={j} className="h-3 rounded bg-card animate-pulse flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
