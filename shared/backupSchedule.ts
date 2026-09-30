export type BackupFrequency = 'daily' | 'weekly'

export interface BackupSchedule {
  frequency: BackupFrequency
  time: string
}

export const DEFAULT_BACKUP_FREQUENCY: BackupFrequency = 'daily'
export const DEFAULT_BACKUP_TIME = '21:00'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function parseBackupFrequency(raw: string | null | undefined): BackupFrequency {
  return raw === 'weekly' ? 'weekly' : DEFAULT_BACKUP_FREQUENCY
}

export function parseBackupTime(raw: string | null | undefined): string {
  const value = raw?.trim() ?? ''
  return TIME_RE.test(value) ? value : DEFAULT_BACKUP_TIME
}

export function normalizeBackupSchedule(input: {
  frequency?: string | null
  time?: string | null
}): BackupSchedule {
  return {
    frequency: parseBackupFrequency(input.frequency),
    time: parseBackupTime(input.time),
  }
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function atLocalTime(day: Date, hhmm: string): Date {
  const time = parseBackupTime(hhmm)
  const hours = Number(time.slice(0, 2))
  const minutes = Number(time.slice(3, 5))
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0)
}

function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / 86_400_000)
}

function parseBackupInstant(value: string | null): Date | null {
  if (!value?.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Most recently passed Daily slot (today's HH:mm if it has elapsed, otherwise yesterday's). */
export function lastElapsedSlot(schedule: BackupSchedule, now: Date): Date {
  const todaySlot = atLocalTime(now, schedule.time)
  if (now.getTime() >= todaySlot.getTime()) return todaySlot
  return atLocalTime(addLocalDays(now, -1), schedule.time)
}

export function isBackupDue(
  schedule: BackupSchedule,
  lastBackupAt: string | null,
  now = new Date(),
): boolean {
  const last = parseBackupInstant(lastBackupAt)
  if (!last) return true

  if (schedule.frequency === 'weekly') {
    const days = calendarDaysBetween(last, now)
    if (days > 7) return true
    if (days === 7) return now.getTime() >= atLocalTime(now, schedule.time).getTime()
    return false
  }

  const slot = lastElapsedSlot(schedule, now)
  return startOfLocalDay(last).getTime() < startOfLocalDay(slot).getTime()
}

export function nextBackupAt(
  schedule: BackupSchedule,
  lastBackupAt: string | null,
  now = new Date(),
): Date | null {
  if (isBackupDue(schedule, lastBackupAt, now)) return null

  if (schedule.frequency === 'weekly') {
    const last = parseBackupInstant(lastBackupAt) ?? now
    const due = atLocalTime(addLocalDays(last, 7), schedule.time)
    return due.getTime() <= now.getTime() ? null : due
  }

  const last = parseBackupInstant(lastBackupAt)
  const todaySlot = atLocalTime(now, schedule.time)
  if (last && calendarDaysBetween(last, now) === 0) {
    return atLocalTime(addLocalDays(now, 1), schedule.time)
  }
  if (now.getTime() < todaySlot.getTime()) return todaySlot
  return atLocalTime(addLocalDays(now, 1), schedule.time)
}
