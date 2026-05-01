'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export interface AuthUser {
  id: string
  email: string
  full_name?: string
  role: string
  operator_id: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'chf_access_token'
const API_URL   = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

async function fetchMe(token: string): Promise<AuthUser> {
  if (!token) throw new Error('Session invalid')
  console.log('fetchMe called')
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Session invalid')
  const { data } = await res.json() as { data: AuthUser }
  return data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null)
  const [token, setToken]       = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)
  const router                  = useRouter()

  useEffect(() => {
    let mounted = true

    async function initAuth() {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session && mounted) {
          const accessToken = data.session.access_token
          localStorage.setItem(TOKEN_KEY, accessToken)
          const me = await fetchMe(accessToken)
          setToken(accessToken)
          setUser(me)
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initAuth()

    // Keep token fresh on Supabase auto-refresh and sign-out events.
    // INITIAL_SESSION is handled by initAuth(); SIGNED_IN is handled by login().
    // Only call fetchMe() on TOKEN_REFRESHED to avoid duplicate /auth/me requests.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        if (session) {
          const accessToken = session.access_token
          localStorage.setItem(TOKEN_KEY, accessToken)
          setToken(accessToken)
          if (event === 'TOKEN_REFRESHED') {
            try {
              const me = await fetchMe(accessToken)
              setUser(me)
            } catch {
              // Railway rejected refreshed token — force clean logout
              localStorage.removeItem(TOKEN_KEY)
              setToken(null)
              setUser(null)
            }
          }
        } else if (event === 'SIGNED_OUT') {
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
          setUser(null)
        }
      },
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)

    const accessToken = data.session.access_token
    const me = await fetchMe(accessToken)

    localStorage.setItem(TOKEN_KEY, accessToken)
    setToken(accessToken)
    setUser(me)
    router.push('/bookings')
  }, [router])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    router.replace('/login')
  }, [router])

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
