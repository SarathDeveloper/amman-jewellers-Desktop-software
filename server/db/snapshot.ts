import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { backupExcelName, backupKindForName, selectBackupsToKeep } from '@shared/backupRetention'
import { localNowStamp } from '@shared/localDate'
import { getBackupsDir } from '../lib/paths'

/**
 * Snapshot helpers that must stay importable from `db/index.ts` during startup.
 * They deliberately do not import `db/backup.ts`, so migration-time snapshots
 * cannot create a circular dependency.
 */

export function vacuumSnapshot(db: Database, destinationPath: string): void {
  if (existsSync(destinationPath)) {
    unlinkSync(destinationPath)
  }
  db.prepare('VACUUM INTO ?').run(destinationPath)
}

export function prerestoreSnapshotName(stamp = localNowStamp()): string {
  return `jeweltrackerpro-prerestore-${stamp}.db`
}

export function premigrateSnapshotName(fromVersion: number, stamp = localNowStamp()): string {
  return `jeweltrackerpro-premigrate-v${fromVersion}-${stamp}.db`
}

/**
 * Deletes backup files that fall outside the retention tiers, along with their
 * Excel sibling. Files that are not recognised backup names are left alone.
 */
export function pruneBackupFiles(dir: string): void {
  if (!existsSync(dir)) return
  const names = readdirSync(dir)
  const keep = selectBackupsToKeep(names)
  for (const name of names) {
    if (!backupKindForName(name)) continue
    if (keep.has(name)) continue
    try {
      unlinkSync(join(dir, name))
    } catch {
      continue
    }
    removeBackupSiblings(dir, name)
  }
}

/** Removes the Excel copy and SQLite sidecars that belong to a deleted backup. */
export function removeBackupSiblings(dir: string, name: string): void {
  for (const sibling of [backupExcelName(name), `${name}-wal`, `${name}-shm`]) {
    const path = join(dir, sibling)
    if (existsSync(path)) {
      try {
        unlinkSync(path)
      } catch {
        // Leaving a sibling behind is harmless.
      }
    }
  }
}

/**
 * Safety snapshot written before schema migrations run. Returns the file name,
 * or throws when the snapshot cannot be written so the caller can refuse to
 * migrate an unprotected database.
 */
export function writePremigrateSnapshot(db: Database, fromVersion: number): string {
  const dir = getBackupsDir()
  mkdirSync(dir, { recursive: true })
  const name = premigrateSnapshotName(fromVersion)
  const destination = join(dir, name)
  try {
    vacuumSnapshot(db, destination)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not save a safety backup before updating the database: ${detail}`, {
      cause: error,
    })
  }
  pruneBackupFiles(dir)
  return name
}
