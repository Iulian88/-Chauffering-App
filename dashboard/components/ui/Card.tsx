import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('bg-card border border-border rounded-xl', className)}>
      {children}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}

export function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <Card className="px-6 py-5 relative overflow-hidden">
      {accent && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent" />
      )}
      <p className="text-xs font-medium text-secondary uppercase tracking-wider">{label}</p>
      <p className={cn('text-3xl font-light mt-2', accent ? 'text-accent' : 'text-primary')}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </Card>
  )
}
