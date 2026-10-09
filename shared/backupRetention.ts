import type { BackupKind } from './types'

export const BACKUP_EXTENSION_RE = /\.db$/i

const DAILY_RE = /^jeweltrackerpro-(\d{4})-(\d{2})-(\d{2})\.db$/
const MANUAL_RE = /^jeweltrackerpro-manual-(\d{8})-(\d{6})\.db$/
const DAYCLOSE_RE = /^jeweltrackerpro-dayclose-(\d{4})-(\d{2})-(\d{2})-[a-z]+-(\d{6})\.db$/
const PRERESTORE_RE = /^jeweltrackerpro-prerestore-(\d{8})-(\d{6})\.db$/
const PREMIGRATE_RE = /^jeweltrackerpro-premigrate-v(\d+)-(\d{8})-(\d{6})\.db$/

/** Per-kind caps applied in addition to the daily week/month tiers. */
export const BACKUP_KIND_CAPS: Record<BackupKind, number> = {
  daily: 14,
  manual: 30,
  dayclose: 60,
  prerestore: 5,
  premigrate: 5,
}

export const DAILY_TIER = { recent: 14, weeks: 8, months: 12 }

export function backupKindForName(name: string): BackupKind | null {
  if (DAILY_RE.test(name)) return 'daily'
  if (MANUAL_RE.test(name)) return 'manual'
  if (DAYCLOSE_RE.test(name)) return 'dayclose'
  if (PRERESTORE_RE.test(name)) return 'prerestore'
  if (PREMIGRATE_RE.test(name)) return 'premigrate'
  return null
}

export function backupExcelName(name: string): string {
  return name.replace(BACKUP_EXTENSION_RE, '.xlsx')
}

function pad2(value: string): number {
  return Number.parseInt(value, 10)
}

/**
 * Timestamp encoded in a backup file name, as local time. `YYYYMMDD`/`HHMMSS`
 * pairs and `YYYY-MM-DD` dates both parse; the day is anchored at noon so a
 * timezone shift cannot move it across a day boundary.
 */
function stampFromName(name: string, kind: BackupKind): number | null {
  if (kind === 'daily') {
    const match = DAILY_RE.exec(name)
    if (!match) return null
    return new Date(Number(match[1]), pad2(match[2]) - 1, pad2(match[3]), 12, 0, 0).getTime()
  }
  if (kind === 'dayclose') {
    const match = DAYCLOSE_RE.exec(name)
    if (!match) return null
    const time = match[4] ?? '120000'
    return new Date(
      Number(match[1]),
      pad2(match[2]) - 1,
      pad2(match[3]),
      pad2(time.slice(0, 2)),
      pad2(time.slice(2, 4)),
      pad2(time.slice(4, 6)),
    ).getTime()
  }
  const match =
    kind === 'manual'
      ? MANUAL_RE.exec(name)
      : kind === 'prerestore'
        ? PRERESTORE_RE.exec(name)
        : PREMIGRATE_RE.exec(name)
  if (!match) return null
  const day = match[match.length - 2]
  const time = match[match.length - 1]
  if (!day || !time) return null
  return new Date(
    Number(day.slice(0, 4)),
    pad2(day.slice(4, 6)) - 1,
    pad2(day.slice(6, 8)),
    pad2(time.slice(0, 2)),
    pad2(time.slice(2, 4)),
    pad2(time.slice(4, 6)),
  ).getTime()
}

function isoWeekKey(time: number): string {
  const date = new Date(time)
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (utc.getUTCDay() + 6) % 7
  utc.setUTCDate(utc.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const week = 1 + Math.round((utc.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${utc.getUTCFullYear()}-W${week}`
}

function monthKey(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${date.getMonth()}`
}

type NamedTime = { name: string; time: number }

/**
 * Backup file names to keep. Daily files keep the newest `recent`, plus the
 * newest file of each of the last `weeks` ISO weeks and each of the last
 * `months` calendar months, so end-of-month and tax-time restores still reach
 * back further than a fortnight. Every other kind is capped by `BACKUP_KIND_CAPS`.
 */
export function selectBackupsToKeep(names: string[], now = new Date()): Set<string> {
  const keep = new Set<string>()
  const byKind = new Map<BackupKind, NamedTime[]>()

  for (const name of names) {
    const kind = backupKindForName(name)
    if (!kind) continue
    const time = stampFromName(name, kind)
    if (time === null) continue
    const list = byKind.get(kind)
    if (list) {
      list.push({ name, time })
    } else {
      byKind.set(kind, [{ name, time }])
    }
  }
  for (const list of byKind.values()) {
    list.sort((a, b) => b.time - a.time)
  }

  const daily = byKind.get('daily') ?? []
  for (const file of daily.slice(0, DAILY_TIER.recent)) {
    keep.add(file.name)
  }

  const weekCutoff = now.getTime() - DAILY_TIER.weeks * 7 * 86_400_000
  const weeks = new Set<string>()
  for (const file of daily) {
    if (weeks.size >= DAILY_TIER.weeks) break
    if (file.time < weekCutoff) continue
    const key = isoWeekKey(file.time)
    if (weeks.has(key)) continue
    weeks.add(key)
    keep.add(file.name)
  }

  const monthCutoff = new Date(now.getFullYear(), now.getMonth() - (DAILY_TIER.months - 1), 1).getTime()
  const months = new Set<string>()
  for (const file of daily) {
    if (months.size >= DAILY_TIER.months) break
    if (file.time < monthCutoff) continue
    const key = monthKey(file.time)
    if (months.has(key)) continue
    months.add(key)
    keep.add(file.name)
  }

  for (const [kind, list] of byKind) {
    for (const file of list.slice(0, BACKUP_KIND_CAPS[kind])) {
      keep.add(file.name)
    }
  }

  return keep
}
