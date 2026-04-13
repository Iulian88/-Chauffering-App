import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, disabled, children, className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium tracking-wide transition-all duration-100 rounded-lg focus-visible:ring-2 focus-visible:ring-accent/30 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none',

        // Variants
        variant === 'primary'   && 'bg-accent text-[#0B0B0C] hover:bg-accent/90',
        variant === 'secondary' && 'bg-card border border-border text-secondary hover:text-primary hover:border-border/80',
        variant === 'ghost'     && 'bg-transparent text-secondary hover:text-primary hover:bg-border-subtle',
        variant === 'danger'    && 'bg-transparent border border-red-900/50 text-red-400 hover:bg-red-950/30',

        // Sizes
        size === 'md' && 'px-4 py-2.5 text-sm gap-2',
        size === 'sm' && 'px-3 py-1.5 text-xs gap-1.5',

        className
      )}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <Spinner />
          {children}
        </span>
      ) : children}
    </button>
  )
})

function Spinner() {
  return (
    <svg
      className="animate-spin h-3 w-3 text-current"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}
