const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day:   '2-digit',
  month: 'short',
  year:  'numeric',
})

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour:   '2-digit',
  minute: '2-digit',
  hour12: false,
})

const DATETIME_FMT = new Intl.DateTimeFormat('en-GB', {
  day:    '2-digit',
  month:  'short',
  hour:   '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso))
}

export function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return DATETIME_FMT.format(new Date(iso))
}

export function formatPrice(amount: number, currency = 'RON'): string {
  return `${amount.toFixed(2)} ${currency}`
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

export function truncateAddress(address: string, maxLen = 32): string {
  if (address.length <= maxLen) return address
  return address.slice(0, maxLen - 1) + '…'
}

export function segmentLabel(segment: string): string {
  const labels: Record<string, string> = {
    ride:       'Ride',
    business:   'Business',
    executive:  'Executive',
    office_lux: 'Office Lux',
    prime_lux:  'Prime Lux',
  }
  return labels[segment] ?? segment
}
