interface PageHeaderProps {
  title: string
  subtitle?: string
  count?: number
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, count, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-primary tracking-tight">{title}</h1>
          {count !== undefined && (
            <span className="text-xs text-muted font-medium tabular-nums">
              {count.toLocaleString()}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-secondary mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
