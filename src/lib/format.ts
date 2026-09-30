export function formatInr(amount: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatCurrency(amount: number): string {
  return `₹${formatInr(amount)}`
}

export function formatWeight(weight: number, fractionDigits = 2): string {
  return `${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 3,
  }).format(weight)} g`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** Display dates as `22 Sep 2026` (day, 3-letter month, year). Storage stays ISO `YYYY-MM-DD`. */
export function formatDisplayDate(isoDate: string): string {
  const key = isoDate.trim().slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return isoDate.trim() || '—'
  const year = match[1]
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return isoDate.trim()
  return `${day} ${MONTHS[month - 1]} ${year}`
}

function parseUtcDateTime(value: string): Date {
  const trimmed = value.trim()
  if (!trimmed) return new Date(Number.NaN)
  if (trimmed.includes('T')) return new Date(trimmed)
  return new Date(`${trimmed.replace(' ', 'T')}Z`)
}

function formatClock(hour24: number, minute: number): string {
  const ampm = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`
}

function formatDisplayTime(date: Date): string {
  return formatClock(date.getHours(), date.getMinutes())
}

/** Display a stored `HH:mm` clock as `9:00 PM`. */
export function formatDisplayClock(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm.trim())
  if (!match) return hhmm.trim() || '—'
  const hour24 = Number(match[1])
  const minute = Number(match[2])
  if (hour24 > 23 || minute > 59) return hhmm.trim()
  return formatClock(hour24, minute)
}

export function formatDisplayDateTime(value: string | null | undefined): string {
  if (!value?.trim()) return '—'
  const date = parseUtcDateTime(value)
  if (Number.isNaN(date.getTime())) return formatDisplayDate(value)
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ${formatDisplayTime(date)}`
}

export function formatPaymentMode(mode: string): string {
  if (mode === 'upi') return 'UPI'
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

export const TABLE_PAGE_SIZE = 25
