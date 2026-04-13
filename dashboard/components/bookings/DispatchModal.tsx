'use client'

import { useState, useEffect } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { type ApiClient, type Driver } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'

interface Props {
  bookingId: string
  api: ApiClient
  onClose: () => void
  onSuccess: () => void
}

export function DispatchModal({ bookingId, api, onClose, onSuccess }: Props) {
  const [drivers, setDrivers]     = useState<Driver[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading]     = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    api.drivers.availableFor(bookingId)
      .then(({ data }) => setDrivers(data))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load drivers'))
      .finally(() => setLoading(false))
  }, [api, bookingId])

  const selectedDriver = drivers.find(d => d.id === selectedId)
  const vehicle = selectedDriver?.vehicles?.[0]

  async function handleSubmit() {
    if (!selectedDriver || !vehicle) return
    setSubmitting(true)
    setError(null)
    try {
      await api.dispatch.assign(bookingId, selectedDriver.id, vehicle.id)
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Dispatch failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-primary tracking-wide">Assign Driver</h2>
            <p className="text-xs text-muted mt-0.5">Booking {bookingId.slice(0, 8).toUpperCase()}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-secondary hover:bg-border-subtle transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">

          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-lg bg-border-subtle animate-pulse" />
              ))}
            </div>
          )}

          {!loading && drivers.length === 0 && (
            <div className="flex items-center gap-3 rounded-lg bg-border-subtle/50 border border-border px-4 py-4">
              <AlertCircle size={16} className="text-secondary flex-shrink-0" />
              <p className="text-sm text-secondary">No available drivers at this time.</p>
            </div>
          )}

          {!loading && drivers.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-secondary uppercase tracking-wider">
                Select Driver
              </label>
              <div className="space-y-2">
                {drivers.map(driver => {
                  const veh = driver.vehicles?.[0]
                  const name = driver.user_profiles?.full_name ?? `Driver ${driver.id.slice(0, 6)}`
                  const isSelected = driver.id === selectedId
                  return (
                    <button
                      key={driver.id}
                      onClick={() => setSelectedId(driver.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-accent/60 bg-accent-muted'
                          : 'border-border bg-base hover:border-border/70 hover:bg-border-subtle/40'
                      }`}
                    >
                      <div>
                        <p className={`text-sm font-medium ${isSelected ? 'text-accent' : 'text-primary'}`}>
                          {name}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {veh ? `${veh.plate} · ${veh.make} ${veh.model}` : 'No vehicle assigned'}
                        </p>
                      </div>
                      <StatusBadge status={driver.availability_status} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Vehicle confirmation */}
          {vehicle && (
            <div className="rounded-lg bg-base border border-border px-4 py-3">
              <p className="text-xs text-muted uppercase tracking-wider mb-2">Assigned Vehicle</p>
              <p className="text-sm text-primary font-medium">{vehicle.make} {vehicle.model} ({vehicle.year})</p>
              <p className="text-xs text-secondary mt-0.5">{vehicle.plate} · {vehicle.segment}</p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2.5">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedId || !vehicle}
            loading={submitting}
            onClick={handleSubmit}
          >
            Confirm Dispatch
          </Button>
        </div>
      </div>
    </div>
  )
}
