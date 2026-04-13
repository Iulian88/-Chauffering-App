'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { useAuth } from '@/context/auth-context'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth()
  const router               = useRouter()

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace('/login')
    }
  }, [token, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <span className="block w-[3px] h-8 bg-accent/60 animate-pulse rounded-full" />
      </div>
    )
  }

  if (!token) return null

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
