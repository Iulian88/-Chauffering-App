'use client'

import { useState, type FormEvent } from 'react'
import { useAuth } from '@/context/auth-context'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const { login }               = useAuth()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
      <div className="w-full max-w-[380px]">

        {/* Brand */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-3 mb-7">
            <span className="block w-px h-7 bg-accent opacity-60" />
            <span className="text-[10px] font-semibold tracking-[0.3em] text-primary uppercase">
              Chauffeur Hub
            </span>
            <span className="block w-px h-7 bg-accent opacity-60" />
          </div>
          <h1 className="text-lg font-light text-primary tracking-wide">
            Operator Access
          </h1>
          <p className="text-xs text-secondary mt-2 tracking-wide">
            Authorized personnel only
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl shadow-modal p-8">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>

            <div className="space-y-1.5">
              <label className="block text-2xs font-medium text-muted uppercase tracking-widest">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                spellCheck={false}
                className="w-full bg-base border border-border rounded-lg px-4 py-3 text-sm text-primary placeholder:text-muted/60 transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                placeholder="operator@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-2xs font-medium text-muted uppercase tracking-widest">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-base border border-border rounded-lg px-4 py-3 text-sm text-primary placeholder:text-muted/60 transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                placeholder="••••••••••••"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-900/50 bg-red-950/25 px-3.5 py-3">
                <p className="text-xs text-red-400/90">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 bg-accent text-[#0B0B0C] rounded-lg py-3 text-sm font-semibold tracking-wide hover:bg-accent/90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
            >
              {loading ? 'Authenticating…' : 'Sign In'}
            </button>

          </form>
        </div>

        <p className="text-center text-2xs text-muted/60 mt-8 tracking-wide">
          © {new Date().getFullYear()} Chauffeur Hub. All rights reserved.
        </p>
      </div>
    </div>
  )
}
