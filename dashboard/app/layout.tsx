import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/auth-context'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { template: '%s — Chauffeur Hub', default: 'Chauffeur Hub' },
  description: 'Premium fleet management and dispatch platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-base text-primary antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
