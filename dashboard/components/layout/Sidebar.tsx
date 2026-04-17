'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  BookMarked,
  Route,
  Users,
  Car,
  Link2,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { cn } from '@/lib/utils'

const NAV = [
  { label: 'Dashboard',   href: '/',            icon: LayoutDashboard, exact: true },
  { label: 'Bookings',    href: '/bookings',    icon: BookMarked,       exact: false },
  { label: 'Trips',       href: '/trips',       icon: Route,            exact: false },
  { label: 'Drivers',     href: '/drivers',     icon: Users,            exact: false },
  { label: 'Fleet',       href: '/vehicles',    icon: Car,              exact: false },
  { label: 'Assignments', href: '/assignments', icon: Link2,            exact: false },
]

export function Sidebar() {
  const pathname  = usePathname()
  const { user, logout } = useAuth()

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-card border-r border-border flex flex-col z-30 select-none">

      {/* Brand mark */}
      <div className="px-5 py-5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="block w-[3px] h-5 bg-accent rounded-full" />
          <span className="text-[10px] font-semibold tracking-[0.22em] text-primary uppercase">
            Chauffeur Hub
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ label, href, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-100 group',
                isActive
                  ? 'text-accent bg-accent-muted'
                  : 'text-secondary hover:text-primary hover:bg-border-subtle'
              )}
            >
              {/* Active indicator */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-full" />
              )}

              <Icon
                size={15}
                className={cn(
                  'flex-shrink-0 transition-colors',
                  isActive ? 'text-accent' : 'text-muted group-hover:text-secondary'
                )}
              />
              <span className="font-medium tracking-wide">{label}</span>

              {isActive && (
                <ChevronRight size={12} className="ml-auto text-accent/50" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer — user info + logout */}
      {user && (
        <div className="px-2.5 py-3 border-t border-border flex-shrink-0">
          <div className="px-3 py-2.5 rounded-md bg-base mb-1">
            <p className="text-xs font-medium text-primary truncate">{user.full_name}</p>
            <p className="text-2xs text-muted truncate mt-0.5 capitalize">{user.role.replace('_', ' ')}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-xs text-secondary hover:text-primary hover:bg-border-subtle transition-colors"
          >
            <LogOut size={13} className="text-muted" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </aside>
  )
}
