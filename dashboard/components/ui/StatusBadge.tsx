import { cn } from '@/lib/utils'

type BookingStatus = 'pending' | 'confirmed' | 'dispatched' | 'in_progress' | 'completed' | 'cancelled'
type DriverStatus  = 'available' | 'busy' | 'offline'
type TripStatus    = 'assigned' | 'accepted' | 'en_route' | 'arrived' | 'in_progress' | 'completed' | 'cancelled'

type AnyStatus = BookingStatus | DriverStatus | TripStatus | string

interface StatusConfig {
  label: string
  text: string
  bg: string
}

const STATUS_MAP: Record<string, StatusConfig> = {
  // Booking
  pending:     { label: 'Pending',     text: 'text-[#8A8A94]', bg: 'bg-[#18181C]' },
  confirmed:   { label: 'Confirmed',   text: 'text-[#5B8AF7]', bg: 'bg-[#0D1629]' },
  dispatched:  { label: 'Dispatched',  text: 'text-accent',    bg: 'bg-accent-muted' },
  in_progress: { label: 'In Progress', text: 'text-[#4CAF7D]', bg: 'bg-[#0D1E15]' },
  completed:   { label: 'Completed',   text: 'text-primary',   bg: 'bg-[#1A1A1E]' },
  cancelled:   { label: 'Cancelled',   text: 'text-[#E05252]', bg: 'bg-[#1E0D0D]' },
  // Driver
  available:   { label: 'Available',   text: 'text-[#4CAF7D]', bg: 'bg-[#0D1E15]' },
  busy:        { label: 'On Trip',     text: 'text-accent',    bg: 'bg-accent-muted' },
  offline:     { label: 'Offline',     text: 'text-[#8A8A94]', bg: 'bg-[#18181C]' },
  // Trip
  assigned:    { label: 'Assigned',    text: 'text-accent',    bg: 'bg-accent-muted' },
  accepted:    { label: 'Accepted',    text: 'text-[#5B8AF7]', bg: 'bg-[#0D1629]' },
  en_route:    { label: 'En Route',    text: 'text-[#4CAF7D]', bg: 'bg-[#0D1E15]' },
  arrived:     { label: 'Arrived',     text: 'text-[#4CAF7D]', bg: 'bg-[#0D1E15]' },
}

interface Props {
  status: AnyStatus
  className?: string
}

export function StatusBadge({ status, className }: Props) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    text: 'text-[#8A8A94]',
    bg: 'bg-[#18181C]',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium tracking-wide',
        config.text,
        config.bg,
        className
      )}
    >
      {config.label}
    </span>
  )
}
