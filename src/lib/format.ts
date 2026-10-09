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

/** Display a stored `YYYY-MM` month as `Sep 2026`. */
export function formatDisplayMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim())
  if (!match) return value.trim() || '—'
  const month = Number(match[2])
  if (month < 1 || month > 12) return value.trim()
  return `${MONTHS[month - 1]} ${match[1]}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Chart axis label like `22 Sep` — day and 3-letter month, no year. */
export function formatDisplayDayMonth(value: string): string {
  const display = formatDisplayDate(value)
  const parts = display.split(' ')
  return parts.length >= 3 ? `${parts[0]} ${parts[1]}` : display
}

/** Weekday name from an ISO date: `Mon`. */
export function formatDisplayWeekday(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim().slice(0, 10))
  if (!match) return isoDate.trim() || '—'
  const weekDay = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()
  return WEEKDAYS[weekDay]
}

/** Chart axis clock label: `9 AM`, `12 PM`, `3 PM`. */
export function formatDisplayHour(hour24: number): string {
  const ampm = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12} ${ampm}`
}

/** Compact chart month label: `Sep 2026`, or `Sep 26` when `shortYear`. */
export function formatDisplayMonthShort(value: string, shortYear = false): string {
  const display = formatDisplayMonth(value)
  if (!shortYear) return display
  const parts = display.split(' ')
  return parts.length === 2 ? `${parts[0]} ${parts[1].slice(2)}` : display
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
