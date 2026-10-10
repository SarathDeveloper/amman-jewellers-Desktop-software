import type { BackupStatus } from './types'

export type BackupHealthTone = 'ok' | 'warn' | 'stale'

export const ATTENTION_DAYS = 2
export const OFFSITE_ATTENTION_DAYS = 2

/** Dispatched by Backup settings whenever a fresh BackupStatus is applied. */
export const BACKUP_STATUS_EVENT = 'backup-status-changed'

function startOfLocalDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

export function daysSinceBackup(iso: string | null, now = new Date()): number | null {
  if (!iso) return null
  const last = new Date(iso)
  if (Number.isNaN(last.getTime())) return null
  return Math.round((startOfLocalDay(now) - startOfLocalDay(last)) / 86_400_000)
}

export function offsiteCopyCurrent(
  offsiteDir: string,
  lastOffsiteAt: string | null,
  lastOffsiteError: string | null,
): boolean {
  if (!offsiteDir.trim()) return true
  return !lastOffsiteError && Boolean(lastOffsiteAt)
}

export function healthTone(days: number | null, offsiteCurrent: boolean): BackupHealthTone {
  if (!offsiteCurrent) {
    if (days === null || days >= 8) return 'stale'
    return 'warn'
  }
  if (days === null || days >= 8) return 'stale'
  if (days >= 1) return 'warn'
  return 'ok'
}

export function healthTitle(days: number | null, offsiteCurrent: boolean): string {
  if (!offsiteCurrent) return 'Off-machine copy is not current'
  if (days === null) return 'No backup yet'
  if (days === 0) return 'Backed up today'
  if (days === 1) return 'Last backup 1 day ago'
  return `Last backup ${days} days ago`
}

/**
 * True when the backup state needs staff attention and should surface outside
 * the Settings page: no backup for `ATTENTION_DAYS`, no off-machine folder at
 * all, a failed off-machine copy, or an off-machine copy older than
 * `OFFSITE_ATTENTION_DAYS`. A folder that is set but has not been copied to
 * yet is not a warning; the next backup or Copy now covers it.
 */
export function needsAttention(status: BackupStatus, now = new Date()): boolean {
  const days = daysSinceBackup(status.lastBackupAt, now)
  if (days === null || days >= ATTENTION_DAYS) return true
  if (!status.offsiteDir.trim()) return true
  if (status.lastOffsiteError) return true
  const offsiteDays = daysSinceBackup(status.lastOffsiteAt, now)
  if (offsiteDays === null) return false
  return offsiteDays >= OFFSITE_ATTENTION_DAYS
}

export function backupAttentionMessage(status: BackupStatus, now = new Date()): string {
  const days = daysSinceBackup(status.lastBackupAt, now)
  if (days === null) return 'No database backup has been taken yet.'
  if (days >= ATTENTION_DAYS) return `The last database backup was ${days} days ago.`
  if (!status.offsiteDir.trim()) return 'No off-machine backup folder is set, so the only copy is on this computer.'
  if (status.lastOffsiteError) return `The off-machine copy failed: ${status.lastOffsiteError}`
  const offsiteDays = daysSinceBackup(status.lastOffsiteAt, now)
  if (offsiteDays === null) return 'No verified off-machine copy has been made yet.'
  return `The off-machine copy is ${offsiteDays} days old.`
}
