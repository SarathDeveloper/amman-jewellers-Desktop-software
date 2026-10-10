import { createHash } from 'node:crypto'
import { createReadStream, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import type { BackupFile, BackupInspection, BackupKind, BackupStatus } from '@shared/types'
import { backupKindForName } from '@shared/backupRetention'
import {
  DEFAULT_BACKUP_FREQUENCY,
  DEFAULT_BACKUP_TIME,
  isBackupDue,
  nextBackupAt,
  normalizeBackupSchedule,
  type BackupSchedule,
} from '@shared/backupSchedule'
import { localDateIso, localNowStamp, localTimeStamp } from '@shared/localDate'
import { getShopSetting, setShopSetting } from '../lib/settingsStore'
import { getBackupsDir, getDataDir, getUploadsDir } from '../lib/paths'
import { sqliteNativeOptions } from '../lib/sqliteNative'
import { HttpError } from '../lib/http'
import { logDiagnostic } from '../lib/logger'
import { closeDatabase, getDatabase, getDbPath, initDatabase } from './index'
import { excelPathFor, writeExcelBackupFromSqliteFile } from './excelBackup'
import { latestMigrationVersion } from './migrations'
import { offsiteDirError } from './offsitePath'
import { prerestoreSnapshotName, pruneBackupFiles, removeBackupSiblings } from './snapshot'

export const LAST_BACKUP_AT_KEY = 'last_backup_at'
export const LAST_SCHEDULED_BACKUP_AT_KEY = 'last_scheduled_backup_at'
export const BACKUP_FREQUENCY_KEY = 'backup_frequency'
export const BACKUP_TIME_KEY = 'backup_time'
export const OFFSITE_DIR_KEY = 'backup_offsite_dir'
export const LAST_OFFSITE_AT_KEY = 'last_offsite_at'
export const LAST_OFFSITE_ERROR_KEY = 'last_offsite_error'
export const LAST_OFFSITE_SOURCE_KEY = 'last_offsite_source'

const RESTORE_REQUIRED_TABLES = ['schema_migrations', 'users', 'shop_settings', 'products', 'invoices'] as const
const INVOICE_INSTANT_COLUMNS = ['created_at', 'invoice_date', 'bill_date', 'date'] as const

/**
 * Serialises every operation that reads or replaces the database files, so a
 * scheduled backup, an off-machine copy, a manual backup, a day-close backup
 * and a restore can never overlap.
 */
let queue: Promise<unknown> = Promise.resolve()
let pendingTasks = 0

export function withBackupLock<T>(task: () => Promise<T>): Promise<T> {
  pendingTasks += 1
  const run = queue.then(async () => {
    try {
      return await task()
    } finally {
      pendingTasks -= 1
    }
  })
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function isBackupBusy(): boolean {
  return pendingTasks > 0
}

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

function lastScheduledAnchor(): string | null {
  // Only the scheduled run updates this. A manual or day-close backup must not
  // suppress the day's scheduled backup.
  return settingOrNull(LAST_SCHEDULED_BACKUP_AT_KEY)
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
      setShopSetting(db, LAST_OFFSITE_AT_KEY, '')
    }
    setShopSetting(db, OFFSITE_DIR_KEY, resolved)
  }
  return getBackupStatus()
}

export function getBackupStatus(now = new Date()): BackupStatus {
  const lastBackupAt = settingOrNull(LAST_BACKUP_AT_KEY)
  const schedule = getBackupSchedule()
  const next = nextBackupAt(schedule, lastScheduledAnchor(), now)
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

function markBackupCompleted(options: { scheduled?: boolean } = {}): BackupStatus {
  const db = getDatabase()
  setShopSetting(db, LAST_BACKUP_AT_KEY, new Date().toISOString())
  if (options.scheduled) {
    setShopSetting(db, LAST_SCHEDULED_BACKUP_AT_KEY, new Date().toISOString())
  }
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

function openBackup(filePath: string): Database.Database {
  return new Database(filePath, sqliteNativeOptions({ readonly: true, fileMustExist: true }))
}

function listTableNames(db: Database.Database): Set<string> {
  return new Set(
    (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map(
      (row) => row.name,
    ),
  )
}

function tableCount(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

function countIfPresent(db: Database.Database, tables: Set<string>, table: string): number {
  return tables.has(table) ? tableCount(db, table) : 0
}

function schemaVersionOf(db: Database.Database, tables: Set<string>): number {
  if (!tables.has('schema_migrations')) return 0
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
    version: number | null
  }
  return row.version ?? 0
}

/**
 * Rejects anything that is not a healthy JewelTrackerPro backup this build can
 * open, before the live database is touched.
 */
export function assertRestorableBackup(filePath: string): void {
  try {
    assertSqliteIntegrity(filePath)
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Backup file is damaged and cannot be used')
  }

  const db = openBackup(filePath)
  try {
    const tables = listTableNames(db)
    const missing = RESTORE_REQUIRED_TABLES.filter((table) => !tables.has(table))
    if (missing.length > 0) {
      throw new HttpError(400, 'This file is not a JewelTrackerPro backup')
    }
    if (schemaVersionOf(db, tables) > latestMigrationVersion()) {
      throw new HttpError(
        400,
        'This backup was made by a newer version of the app. Update the app before restoring it.',
      )
    }
  } finally {
    db.close()
  }
}

export function inspectBackup(name: string): BackupInspection {
  const filePath = resolveBackupPath(name)
  const issues: string[] = []
  let db: Database.Database
  try {
    db = openBackup(filePath)
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Backup file could not be opened')
  }
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
      issues.push('The file failed its integrity check')
    }
    const tables = listTableNames(db)
    for (const table of RESTORE_REQUIRED_TABLES) {
      if (!tables.has(table)) {
        issues.push(`Missing table: ${table}`)
      }
    }
    const schemaVersion = schemaVersionOf(db, tables)
    if (schemaVersion > latestMigrationVersion()) {
      issues.push('Made by a newer version of the app')
    }

    let latestInvoiceAt: string | null = null
    if (tables.has('invoices')) {
      const columns = (
        db.prepare('PRAGMA table_info("invoices")').all() as { name: string }[]
      ).map((row) => row.name)
      const column = INVOICE_INSTANT_COLUMNS.find((candidate) => columns.includes(candidate))
      if (column) {
        const row = db.prepare(`SELECT MAX("${column}") AS value FROM invoices`).get() as {
          value: string | null
        }
        latestInvoiceAt = row.value ?? null
      }
    }

    return {
      name,
      schemaVersion,
      appSchemaVersion: latestMigrationVersion(),
      restorable: issues.length === 0,
      latestInvoiceAt,
      counts: {
        customers: countIfPresent(db, tables, 'customers'),
        invoices: countIfPresent(db, tables, 'invoices'),
        pledges: countIfPresent(db, tables, 'pledges'),
        products: countIfPresent(db, tables, 'products'),
        goldSavingAccounts: countIfPresent(db, tables, 'gold_saving_accounts'),
      },
      issues,
    }
  } finally {
    db.close()
  }
}

function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Byte-for-byte proof that the off-machine file equals the local snapshot,
 * plus an integrity check on the copy. Stronger than comparing a few row
 * counts, which can match even when the rest of the file is damaged.
 */
export async function proveBackupRestores(copyPath: string, sourcePath: string): Promise<void> {
  assertSqliteIntegrity(copyPath)
  const [copyHash, sourceHash] = await Promise.all([fileSha256(copyPath), fileSha256(sourcePath)])
  if (copyHash !== sourceHash) {
    throw new Error('Off-machine copy did not match the local backup')
  }
}

export async function backupDatabaseTo(
  destinationPath: string,
  options: { scheduled?: boolean } = {},
): Promise<BackupStatus> {
  const db = getDatabase()
  await db.backup(destinationPath)
  return markBackupCompleted(options)
}

async function writeExcelBeside(dbPath: string): Promise<void> {
  try {
    await writeExcelBackupFromSqliteFile(dbPath)
  } catch (error) {
    logDiagnostic('backup', 'Excel backup failed', error)
  }
}

async function copyExcelBeside(sourceDbPath: string, destDir: string, now: Date): Promise<void> {
  try {
    // Excel is written only for daily and manual snapshots. A day-close or
    // pre-restore snapshot must not grow an extra workbook here.
    const sourceXlsx = excelPathFor(sourceDbPath)
    if (!existsSync(sourceXlsx)) return
    const destXlsx = join(destDir, `jeweltrackerpro-${localDateIso(now)}.xlsx`)
    copyFileSync(sourceXlsx, destXlsx)
  } catch (error) {
    logDiagnostic('backup', 'Off-machine Excel copy failed', error)
  }
}

export async function ensureScheduledBackup(now = new Date()): Promise<void> {
  return withBackupLock(() => runScheduledBackup(now))
}

export const ensureDailyBackup = ensureScheduledBackup

async function runScheduledBackup(now: Date): Promise<void> {
  if (!isBackupDue(getBackupSchedule(), lastScheduledAnchor(), now)) {
    return
  }
  const dir = getBackupsDir()
  const destinationPath = join(dir, `jeweltrackerpro-${localDateIso(now)}.db`)
  await backupDatabaseTo(destinationPath, { scheduled: true })
  await writeExcelBeside(destinationPath)
  pruneBackupFiles(dir)
}

/** Only these kinds are worth mirroring off the machine. */
const OFFSITE_SOURCE_KINDS: BackupKind[] = ['daily', 'manual', 'dayclose']

function newestLocalBackup(): BackupFile | null {
  return listBackups().find((file) => OFFSITE_SOURCE_KINDS.includes(file.kind)) ?? null
}

function sourceFingerprint(file: BackupFile): string {
  const mtimeMs = statSync(join(getBackupsDir(), file.name)).mtimeMs
  return `${file.name}|${mtimeMs}`
}

async function ensureLocalSnapshot(now = new Date()): Promise<BackupFile> {
  const dir = getBackupsDir()
  const destinationPath = join(dir, `jeweltrackerpro-${localDateIso(now)}.db`)
  await backupDatabaseTo(destinationPath)
  await writeExcelBeside(destinationPath)
  pruneBackupFiles(dir)
  const newest = newestLocalBackup()
  if (!newest) {
    throw new Error('Local backup was not found')
  }
  return newest
}

function mirrorUploads(destDir: string): void {
  const sourceDir = getUploadsDir()
  if (!existsSync(sourceDir)) return

  const targetDir = join(destDir, 'uploads')
  try {
    mkdirSync(targetDir, { recursive: true })
  } catch (error) {
    logDiagnostic('backup', 'Off-machine uploads folder could not be created', error)
    return
  }

  for (const name of readdirSync(sourceDir)) {
    try {
      const source = join(sourceDir, name)
      if (!statSync(source).isFile()) continue
      const target = join(targetDir, name)
      if (existsSync(target)) continue
      copyFileSync(source, target)
    } catch (error) {
      logDiagnostic('backup', 'Shop image could not be mirrored', error)
    }
  }
}

async function copyAndProve(sourcePath: string, destDir: string, now: Date): Promise<string> {
  if (!existsSync(destDir)) {
    throw new Error('Off-machine folder was not found')
  }
  if (!statSync(destDir).isDirectory()) {
    throw new Error('Off-machine folder is not a directory')
  }

  const date = localDateIso(now)
  const destPath = join(destDir, `jeweltrackerpro-${date}.db`)
  // Leading "~$" keeps half-written files out of OneDrive/Drive sync clients.
  const partialPath = join(destDir, `~$jeweltrackerpro-${date}.db.tmp`)
  if (existsSync(partialPath)) {
    unlinkSync(partialPath)
  }

  copyFileSync(sourcePath, partialPath)
  try {
    await proveBackupRestores(partialPath, sourcePath)
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

  pruneBackupFiles(destDir)
  await copyExcelBeside(sourcePath, destDir, now)
  mirrorUploads(destDir)
  return destPath
}

export async function copyNewestBackupOffsite(
  options: { forceFresh?: boolean } = {},
  now = new Date(),
): Promise<BackupStatus> {
  return withBackupLock(() => runOffsiteCopy(options, now))
}

async function runOffsiteCopy(options: { forceFresh?: boolean }, now: Date): Promise<BackupStatus> {
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
        await copyExcelBeside(sourcePath, destDir, now)
      }
      mirrorUploads(destDir)
      return getBackupStatus()
    }
    await copyAndProve(sourcePath, destDir, now)
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
  if (isBackupBusy()) return
  await withBackupLock(async () => {
    try {
      await runScheduledBackup(new Date())
    } finally {
      await runOffsiteCopy({}, new Date())
    }
  })
}

/**
 * Snapshot taken after a metal day is closed. Runs under the same lock as every
 * other backup and never throws: a failed backup must not undo a close.
 */
export async function runDayCloseBackup(businessDate: string, metal: string): Promise<boolean> {
  try {
    await withBackupLock(async () => {
      const now = new Date()
      const slug = metal.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'metal'
      const name = `jeweltrackerpro-dayclose-${localDateIso(now)}-${slug}-${localTimeStamp(now)}.db`
      const dir = getBackupsDir()
      await backupDatabaseTo(join(dir, name))
      pruneBackupFiles(dir)
      await runOffsiteCopy({}, now)
    })
    return true
  } catch (error) {
    logDiagnostic('backup', `Day-close backup failed for ${businessDate} ${metal}`, error)
    return false
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

async function writePrerestoreSnapshot(): Promise<string> {
  const dir = getBackupsDir()
  const destination = join(dir, prerestoreSnapshotName())
  if (existsSync(destination)) {
    unlinkSync(destination)
  }
  await getDatabase().backup(destination)
  pruneBackupFiles(dir)
  return destination
}

function restoreShopImages(): void {
  const offsiteDir = getOffsiteDir()
  if (!offsiteDir) return

  const sourceDir = join(offsiteDir, 'uploads')
  if (!existsSync(sourceDir)) return

  const targetDir = getUploadsDir()
  for (const name of readdirSync(sourceDir)) {
    try {
      const source = join(sourceDir, name)
      if (!statSync(source).isFile()) continue
      const target = join(targetDir, name)
      if (existsSync(target)) continue
      copyFileSync(source, target)
    } catch (error) {
      logDiagnostic('backup', 'Shop image could not be restored', error)
    }
  }
}

export async function restoreDatabaseFrom(sourcePath: string): Promise<BackupStatus> {
  return withBackupLock(() => runRestore(sourcePath))
}

async function runRestore(sourcePath: string): Promise<BackupStatus> {
  assertRestorableBackup(sourcePath)

  const dest = getDbPath()
  const safetyCopy = await writePrerestoreSnapshot()

  closeDatabase()
  try {
    copyFileSync(sourcePath, dest)
    removeSidecarFiles(dest)
    initDatabase()
  } catch (error) {
    try {
      // The failed initDatabase leaves a half-built connection in the module.
      // Close it first, or the re-init below would hand back the broken file.
      closeDatabase()
      if (existsSync(safetyCopy)) {
        copyFileSync(safetyCopy, dest)
        removeSidecarFiles(dest)
      }
    } catch (rollbackError) {
      logDiagnostic('backup', 'Restore rollback failed', rollbackError)
    }
    try {
      initDatabase()
    } catch (reinitError) {
      logDiagnostic('backup', 'Database could not be reopened after a failed restore', reinitError)
    }
    logDiagnostic('backup', 'Restore failed and was rolled back', error)
    throw new HttpError(400, 'Backup could not be opened. Your current data was kept.')
  }

  restoreShopImages()
  return getBackupStatus()
}

function backupKind(name: string): BackupKind | null {
  return backupKindForName(name)
}

function describeBackup(name: string, kind: BackupKind): BackupFile {
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
  return withBackupLock(async () => {
    const name = `jeweltrackerpro-manual-${localNowStamp()}.db`
    const destinationPath = join(getBackupsDir(), name)
    await backupDatabaseTo(destinationPath)
    await writeExcelBeside(destinationPath)
    pruneBackupFiles(getBackupsDir())
    return describeBackup(name, 'manual')
  })
}

export function deleteBackup(name: string): void {
  const filePath = resolveBackupPath(name)
  unlinkSync(filePath)
  removeBackupSiblings(getBackupsDir(), name)
}

export async function restoreBackupByName(name: string): Promise<BackupStatus> {
  return restoreDatabaseFrom(resolveBackupPath(name))
}
