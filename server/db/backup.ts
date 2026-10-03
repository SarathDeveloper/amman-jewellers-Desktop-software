import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import Database from 'better-sqlite3'
import type { BackupFile, BackupStatus } from '@shared/types'
import {
  DEFAULT_BACKUP_FREQUENCY,
  DEFAULT_BACKUP_TIME,
  isBackupDue,
  nextBackupAt,
  normalizeBackupSchedule,
  type BackupSchedule,
} from '@shared/backupSchedule'
import { localDateIso, localNowStamp } from '@shared/localDate'
import { getShopSetting, setShopSetting } from '../lib/settingsStore'
import { getBackupsDir } from '../lib/paths'
import { sqliteNativeOptions } from '../lib/sqliteNative'
import { HttpError } from '../lib/http'
import { closeDatabase, getDatabase, getDbPath, initDatabase } from './index'

export const LAST_BACKUP_AT_KEY = 'last_backup_at'
export const BACKUP_FREQUENCY_KEY = 'backup_frequency'
export const BACKUP_TIME_KEY = 'backup_time'
const MAX_DAILY_BACKUPS = 14
const DAILY_RE = /^jeweltrackerpro-\d{4}-\d{2}-\d{2}\.db$/
const MANUAL_RE = /^jeweltrackerpro-manual-\d{8}-\d{6}\.db$/

let scheduledBackupInFlight = false

export function getBackupSchedule(): BackupSchedule {
  const db = getDatabase()
  return normalizeBackupSchedule({
    frequency: getShopSetting(db, BACKUP_FREQUENCY_KEY, DEFAULT_BACKUP_FREQUENCY),
    time: getShopSetting(db, BACKUP_TIME_KEY, DEFAULT_BACKUP_TIME),
  })
}

export function updateBackupSchedule(input: BackupSchedule): BackupStatus {
  const schedule = normalizeBackupSchedule(input)
  const db = getDatabase()
  setShopSetting(db, BACKUP_FREQUENCY_KEY, schedule.frequency)
  setShopSetting(db, BACKUP_TIME_KEY, schedule.time)
  return getBackupStatus()
}

export function getBackupStatus(now = new Date()): BackupStatus {
  const lastBackupAt = getShopSetting(getDatabase(), LAST_BACKUP_AT_KEY, '') || null
  const schedule = getBackupSchedule()
  const next = nextBackupAt(schedule, lastBackupAt, now)
  return {
    lastBackupAt,
    frequency: schedule.frequency,
    time: schedule.time,
    nextBackupAt: next ? next.toISOString() : null,
  }
}

function markBackupCompleted(): BackupStatus {
  setShopSetting(getDatabase(), LAST_BACKUP_AT_KEY, new Date().toISOString())
  return getBackupStatus()
}

export function assertSqliteIntegrity(filePath: string): void {
  if (!existsSync(filePath)) {
    throw new Error('Backup file was not found')
  }

  const check = new Database(filePath, sqliteNativeOptions({ readonly: true, fileMustExist: true }))
  try {
    const result = check.pragma('integrity_check', { simple: true })
    if (result !== 'ok') {
      throw new Error('Backup file is damaged and cannot be used')
    }
  } finally {
    check.close()
  }
}

export async function backupDatabaseTo(destinationPath: string): Promise<BackupStatus> {
  const db = getDatabase()
  await db.backup(destinationPath)
  return markBackupCompleted()
}

function pruneDailyBackups(dir: string): void {
  const files = readdirSync(dir)
    .filter((name) => DAILY_RE.test(name))
    .sort()
    .reverse()

  for (const name of files.slice(MAX_DAILY_BACKUPS)) {
    unlinkSync(join(dir, name))
  }
}

export async function ensureScheduledBackup(now = new Date()): Promise<void> {
  const lastBackupAt = getShopSetting(getDatabase(), LAST_BACKUP_AT_KEY, '') || null
  if (!isBackupDue(getBackupSchedule(), lastBackupAt, now)) {
    return
  }
  const dir = getBackupsDir()
  const destinationPath = join(dir, `jeweltrackerpro-${localDateIso(now)}.db`)
  await backupDatabaseTo(destinationPath)
  pruneDailyBackups(dir)
}

export const ensureDailyBackup = ensureScheduledBackup

export async function tickScheduledBackup(): Promise<void> {
  if (scheduledBackupInFlight) return
  scheduledBackupInFlight = true
  try {
    await ensureScheduledBackup()
  } finally {
    scheduledBackupInFlight = false
  }
}

function removeSidecarFiles(dbPath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${dbPath}${suffix}`
    if (existsSync(sidecar)) {
      unlinkSync(sidecar)
    }
  }
}

export function restoreDatabaseFrom(sourcePath: string): BackupStatus {
  assertSqliteIntegrity(sourcePath)
  const dest = getDbPath()
  closeDatabase()
  try {
    copyFileSync(sourcePath, dest)
    removeSidecarFiles(dest)
  } catch (error) {
    initDatabase()
    throw error
  }
  initDatabase()
  return getBackupStatus()
}

function backupKind(name: string): BackupFile['kind'] | null {
  if (DAILY_RE.test(name)) return 'daily'
  if (MANUAL_RE.test(name)) return 'manual'
  return null
}

function describeBackup(name: string, kind: BackupFile['kind']): BackupFile {
  const stat = statSync(join(getBackupsDir(), name))
  return {
    name,
    createdAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    kind,
  }
}

function resolveBackupPath(name: string): string {
  if (basename(name) !== name || !backupKind(name)) {
    throw new HttpError(400, 'Invalid backup file name')
  }
  const filePath = join(getBackupsDir(), name)
  if (!existsSync(filePath)) {
    throw new HttpError(404, 'Backup file was not found')
  }
  return filePath
}

export function listBackups(): BackupFile[] {
  const dir = getBackupsDir()
  const items: BackupFile[] = []
  for (const name of readdirSync(dir)) {
    const kind = backupKind(name)
    if (!kind) continue
    items.push(describeBackup(name, kind))
  }
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return items
}

export async function createManualBackup(): Promise<BackupFile> {
  const name = `jeweltrackerpro-manual-${localNowStamp()}.db`
  const destinationPath = join(getBackupsDir(), name)
  await backupDatabaseTo(destinationPath)
  return describeBackup(name, 'manual')
}

export function deleteBackup(name: string): void {
  unlinkSync(resolveBackupPath(name))
}

export function restoreBackupByName(name: string): BackupStatus {
  return restoreDatabaseFrom(resolveBackupPath(name))
}
