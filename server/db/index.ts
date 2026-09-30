import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { ensureDefaultAdmin, seedE2eAdmin } from '../auth/users'
import { getDataDir } from '../lib/paths'
import { getMigrations } from './migrations'
import { ensureStockCategories } from './stockCategories'

let db: Database.Database | null = null

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const applied = new Set(
    database
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => (row as { version: number }).version),
  )

  for (const migration of getMigrations()) {
    if (applied.has(migration.version)) {
      continue
    }

    const disableForeignKeys = migration.version === 34
    if (disableForeignKeys) {
      database.pragma('foreign_keys = OFF')
    }
    database.exec('BEGIN')
    try {
      database.exec(migration.sql)
      database
        .prepare('INSERT INTO schema_migrations (version) VALUES (?)')
        .run(migration.version)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    } finally {
      if (disableForeignKeys) {
        database.pragma('foreign_keys = ON')
      }
    }
  }
}

export function getUserDataDir(): string {
  return getDataDir()
}

export function getDbPath(): string {
  return join(getUserDataDir(), 'jeweltrackerpro.db')
}

export function initDatabase(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = getDbPath()
  mkdirSync(dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  ensureStockCategories(db)
  if (process.env.JEWELTRACKERPRO_E2E === '1') {
    seedE2eAdmin(db)
  } else {
    ensureDefaultAdmin(db)
  }
  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
