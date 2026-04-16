'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { type ApiClient, type OperatorHealth } from '@/lib/api'

interface Props {
  operatorId: string
  api: ApiClient
}

export function OperatorHealthCard({ operatorId, api }: Props) {
  const [health, setHealth] = useState<OperatorHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.operators
      .health(operatorId)
      .then(res => setHealth(res.data))
      .catch(err => setError(err?.message ?? 'Failed to load operator health'))
      .finally(() => setLoading(false))
  }, [operatorId, api])

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 animate-pulse">
        <div className="h-4 w-32 bg-border-subtle rounded mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-3 w-full bg-border-subtle rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !health) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-2 text-sm text-red-400">
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <span>{error ?? 'No data'}</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-primary">Operator Health</span>
        {health.hasNoCoverage ? (
          <div className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle size={12} />
            No coverage
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-green-500">
            <CheckCircle size={12} />
            Operational
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-secondary">
        <div>
          <span className="text-muted">Drivers</span>
          <p className="text-primary font-medium">{health.drivers}</p>
        </div>
        <div>
          <span className="text-muted">Vehicles</span>
          <p className="text-primary font-medium">{health.vehicles}</p>
        </div>
      </div>

      {health.segmentsCovered.length > 0 && (
        <div className="text-xs">
          <p className="text-muted mb-1">Covered segments</p>
          <div className="flex flex-wrap gap-1">
            {health.segmentsCovered.map(seg => (
              <span
                key={seg}
                className="bg-green-500/10 text-green-400 border border-green-500/20 rounded px-1.5 py-0.5"
              >
                {seg}
              </span>
            ))}
          </div>
        </div>
      )}

      {health.missingSegments.length > 0 && (
        <div className="text-xs">
          <p className="text-muted mb-1">Missing segments</p>
          <div className="flex flex-wrap gap-1">
            {health.missingSegments.map(seg => (
              <span
                key={seg}
                className="bg-red-500/10 text-red-400 border border-red-500/20 rounded px-1.5 py-0.5"
              >
                {seg}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
