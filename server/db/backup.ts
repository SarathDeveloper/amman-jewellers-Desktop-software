import {
  copyFileSync,
  existsSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
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
import { getBackupsDir, getDataDir } from '../lib/paths'
import { sqliteNativeOptions } from '../lib/sqliteNative'
import { HttpError } from '../lib/http'
import { logDiagnostic } from '../lib/logger'
import { closeDatabase, getDatabase, getDbPath, initDatabase } from './index'
import { excelPathFor, writeExcelBackupFromSqliteFile } from './excelBackup'
import { offsiteDirError } from './offsitePath'

export const LAST_BACKUP_AT_KEY = 'last_backup_at'
export const BACKUP_FREQUENCY_KEY = 'backup_frequency'
export const BACKUP_TIME_KEY = 'backup_time'
export const OFFSITE_DIR_KEY = 'backup_offsite_dir'
export const LAST_OFFSITE_AT_KEY = 'last_offsite_at'
export const LAST_OFFSITE_ERROR_KEY = 'last_offsite_error'
export const LAST_OFFSITE_SOURCE_KEY = 'last_offsite_source'
const MAX_DAILY_BACKUPS = 14
const DAILY_RE = /^jeweltrackerpro-\d{4}-\d{2}-\d{2}\.db$/
const DAILY_XLSX_RE = /^jeweltrackerpro-\d{4}-\d{2}-\d{2}\.xlsx$/
const MANUAL_RE = /^jeweltrackerpro-manual-\d{8}-\d{6}\.db$/
const PROVE_TABLES = ['users', 'products', 'shop_settings'] as const

let scheduledBackupInFlight = false

export function getBackupSchedule(): BackupSchedule {
  const db = getDatabase()
  return normalizeBackupSchedule({
    frequency: getShopSetting(db, BACKUP_FREQUENCY_KEY, DEFAULT_BACKUP_FREQUENCY),
    time: getShopSetting(db, BACKUP_TIME_KEY, DEFAULT_BACKUP_TIME),
  })
}

function settingOrNull(key: string): string | null {
  return getShopSetting(getDatabase(), key, '') || null
}

export function getOffsiteDir(): string {
  return getShopSetting(getDatabase(), OFFSITE_DIR_KEY, '').trim()
}

export function protectedOffsiteRoots(): string[] {
  return [getDataDir(), getBackupsDir(), getDbPath()]
}

export function assertOffsiteDirAllowed(dir: string): void {
  const error = offsiteDirError(dir, protectedOffsiteRoots())
  if (error) {
    throw new HttpError(400, error)
  }
}

export function updateBackupSchedule(input: BackupSchedule & { offsiteDir?: string }): BackupStatus {
  const schedule = normalizeBackupSchedule(input)
  const db = getDatabase()
  setShopSetting(db, BACKUP_FREQUENCY_KEY, schedule.frequency)
  setShopSetting(db, BACKUP_TIME_KEY, schedule.time)
  if (input.offsiteDir !== undefined) {
    const next = input.offsiteDir.trim()
    if (next) {
      assertOffsiteDirAllowed(next)
    }
    const resolved = next && isAbsolute(next) ? resolve(next) : next
    const prev = getShopSetting(db, OFFSITE_DIR_KEY, '')
    if (prev !== resolved) {
      setShopSetting(db, LAST_OFFSITE_SOURCE_KEY, '')
      setShopSetting(db, LAST_OFFSITE_ERROR_KEY, '')
    }
    setShopSetting(db, OFFSITE_DIR_KEY, resolved)
  }
  return getBackupStatus()
}

export function getBackupStatus(now = new Date()): BackupStatus {
  const lastBackupAt = settingOrNull(LAST_BACKUP_AT_KEY)
  const schedule = getBackupSchedule()
  const next = nextBackupAt(schedule, lastBackupAt, now)
  return {
    lastBackupAt,
    frequency: schedule.frequency,
    time: schedule.time,
    nextBackupAt: next ? next.toISOString() : null,
    offsiteDir: getOffsiteDir(),
    lastOffsiteAt: settingOrNull(LAST_OFFSITE_AT_KEY),
    lastOffsiteError: settingOrNull(LAST_OFFSITE_ERROR_KEY),
  }
}

function markBackupCompleted(): BackupStatus {
  setShopSetting(getDatabase(), LAST_BACKUP_AT_KEY, new Date().toISOString())
  return getBackupStatus()
}

function recordOffsiteError(message: string): void {
  setShopSetting(getDatabase(), LAST_OFFSITE_ERROR_KEY, message)
}

function recordOffsiteSuccess(sourceKey: string): void {
  const db = getDatabase()
  setShopSetting(db, LAST_OFFSITE_AT_KEY, new Date().toISOString())
  setShopSetting(db, LAST_OFFSITE_ERROR_KEY, '')
  setShopSetting(db, LAST_OFFSITE_SOURCE_KEY, sourceKey)
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

function tableCount(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

export function proveBackupRestores(copyPath: string, sourcePath: string): void {
  assertSqliteIntegrity(copyPath)
  const copy = new Database(copyPath, sqliteNativeOptions({ readonly: true, fileMustExist: true }))
  const source = new Database(sourcePath, sqliteNativeOptions({ readonly: true, fileMustExist: true }))
  try {
    for (const table of PROVE_TABLES) {
      if (tableCount(copy, table) !== tableCount(source, table)) {
        throw new Error('Off-machine copy did not match the local backup')
      }
    }
  } finally {
    copy.close()
    source.close()
  }
}

export async function backupDatabaseTo(destinationPath: string): Promise<BackupStatus> {
  const db = getDatabase()
  await db.backup(destinationPath)
  return markBackupCompleted()
}

function pruneDatedFiles(dir: string, pattern: RegExp): void {
  if (!existsSync(dir)) return
  const files = readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort()
    .reverse()

  for (const name of files.slice(MAX_DAILY_BACKUPS)) {
    unlinkSync(join(dir, name))
  }
}

function writeExcelBeside(dbPath: string): void {
  try {
    writeExcelBackupFromSqliteFile(dbPath)
  } catch (error) {
    logDiagnostic('backup', 'Excel backup failed', error)
  }
}

function copyExcelBeside(sourceDbPath: string, destDir: string, now: Date): void {
  try {
    const sourceXlsx = excelPathFor(sourceDbPath)
    if (!existsSync(sourceXlsx)) {
      writeExcelBackupFromSqliteFile(sourceDbPath, sourceXlsx)
    }
    if (!existsSync(sourceXlsx)) return
    const destXlsx = join(destDir, `jeweltrackerpro-${localDateIso(now)}.xlsx`)
    copyFileSync(sourceXlsx, destXlsx)
    pruneDatedFiles(destDir, DAILY_XLSX_RE)
  } catch (error) {
    logDiagnostic('backup', 'Off-machine Excel copy failed', error)
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
  writeExcelBeside(destinationPath)
  pruneDatedFiles(dir, DAILY_RE)
  pruneDatedFiles(dir, DAILY_XLSX_RE)
}

export const ensureDailyBackup = ensureScheduledBackup

function newestLocalBackup(): BackupFile | null {
  return listBackups()[0] ?? null
}

function sourceFingerprint(file: BackupFile): string {
  const mtimeMs = statSync(join(getBackupsDir(), file.name)).mtimeMs
  return `${file.name}|${mtimeMs}`
}

async function ensureLocalSnapshot(now = new Date()): Promise<BackupFile> {
  const dir = getBackupsDir()
  const destinationPath = join(dir, `jeweltrackerpro-${localDateIso(now)}.db`)
  await backupDatabaseTo(destinationPath)
  writeExcelBeside(destinationPath)
  pruneDatedFiles(dir, DAILY_RE)
  pruneDatedFiles(dir, DAILY_XLSX_RE)
  const newest = newestLocalBackup()
  if (!newest) {
    throw new Error('Local backup was not found')
  }
  return newest
}

function copyAndProve(sourcePath: string, destDir: string, now: Date): string {
  if (!existsSync(destDir)) {
    throw new Error('Off-machine folder was not found')
  }
  if (!statSync(destDir).isDirectory()) {
    throw new Error('Off-machine folder is not a directory')
  }

  const destPath = join(destDir, `jeweltrackerpro-${localDateIso(now)}.db`)
  const partialPath = `${destPath}.partial`
  if (existsSync(partialPath)) {
    unlinkSync(partialPath)
  }
  copyFileSync(sourcePath, partialPath)
  try {
    proveBackupRestores(partialPath, sourcePath)
    if (existsSync(destPath)) {
      unlinkSync(destPath)
    }
    renameSync(partialPath, destPath)
  } catch (error) {
    if (existsSync(partialPath)) {
      unlinkSync(partialPath)
    }
    throw error
  }
  pruneDatedFiles(destDir, DAILY_RE)
  copyExcelBeside(sourcePath, destDir, now)
  return destPath
}

export async function copyNewestBackupOffsite(
  options: { forceFresh?: boolean } = {},
  now = new Date(),
): Promise<BackupStatus> {
  const destDir = getOffsiteDir()
  if (!destDir) {
    return getBackupStatus()
  }

  try {
    let newest = newestLocalBackup()
    if (options.forceFresh || !newest) {
      newest = await ensureLocalSnapshot(now)
    }
    const sourcePath = join(getBackupsDir(), newest.name)
    const fingerprint = sourceFingerprint(newest)
    const lastSource = getShopSetting(getDatabase(), LAST_OFFSITE_SOURCE_KEY, '')
    if (!options.forceFresh && lastSource === fingerprint) {
      const destXlsx = join(destDir, `jeweltrackerpro-${localDateIso(now)}.xlsx`)
      if (!existsSync(destXlsx)) {
        copyExcelBeside(sourcePath, destDir, now)
      }
      return getBackupStatus()
    }
    copyAndProve(sourcePath, destDir, now)
    recordOffsiteSuccess(fingerprint)
    return getBackupStatus()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Off-machine copy failed'
    recordOffsiteError(message)
    logDiagnostic('backup', 'Off-machine backup copy failed', error)
    return getBackupStatus()
  }
}

export async function tickScheduledBackup(): Promise<void> {
  if (scheduledBackupInFlight) return
  scheduledBackupInFlight = true
  try {
    try {
      await ensureScheduledBackup()
    } finally {
      await copyNewestBackupOffsite()
    }
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
  writeExcelBeside(destinationPath)
  return describeBackup(name, 'manual')
}

export function deleteBackup(name: string): void {
  const filePath = resolveBackupPath(name)
  unlinkSync(filePath)
  const xlsxPath = excelPathFor(filePath)
  if (existsSync(xlsxPath)) {
    unlinkSync(xlsxPath)
  }
}

export function restoreBackupByName(name: string): BackupStatus {
  return restoreDatabaseFrom(resolveBackupPath(name))
}
