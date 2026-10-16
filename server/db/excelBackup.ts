import { existsSync, unlinkSync } from 'node:fs'
import Database from 'better-sqlite3'
import { sqliteNativeOptions } from '../lib/sqliteNative'
import { writeXlsxFile, type ExcelSheet } from '../lib/xlsxWorkbook'

/** Shop records staff open first. Empty copies of these stay with the other tables. */
const PRIMARY_TABLES = [
  'invoices',
  'invoice_items',
  'customers',
  'products',
  'stock_movements',
  'pledges',
  'pledge_items',
  'gold_saving_accounts',
  'gold_saving_installments',
  'gold_saving_payments',
  'customer_dues',
  'suppliers',
  'inwards',
  'old_gold_purchases',
  'metal_rates',
] as const

export function partitionBackupTables(
  tables: string[],
  rowCount: (table: string) => number,
): { primary: string[]; rest: string[] } {
  const present = new Set(tables)
  const primary = PRIMARY_TABLES.filter((table) => present.has(table) && rowCount(table) > 0)
  const primarySet = new Set<string>(primary)
  const rest = tables.filter((table) => !primarySet.has(table))
  rest.sort((a, b) => {
    const aEmpty = rowCount(a) > 0 ? 0 : 1
    const bEmpty = rowCount(b) > 0 ? 0 : 1
    if (aEmpty !== bEmpty) return aEmpty - bEmpty
    return a.localeCompare(b)
  })
  return { primary, rest }
}

export function excelPathFor(dbPath: string): string {
  return dbPath.replace(/\.db$/i, '.xlsx')
}

export function listUserTables(db: Database.Database): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string }[]
  return rows.map((row) => row.name)
}

const REDACTED_COLUMNS = new Set(['password_hash', 'password_salt'])

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

export function readTableSheet(db: Database.Database, table: string): ExcelSheet {
  const info = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as { name: string }[]
  const columns = info.map((col) => col.name)
  const rawRows = db.prepare(`SELECT * FROM ${quoteIdent(table)}`).raw(true).all() as unknown[][]
  const rows = rawRows.map((row) =>
    row.map((value, index) => (REDACTED_COLUMNS.has(columns[index] ?? '') ? '' : value)),
  )
  return { name: table, columns, rows }
}

function tableRowCounts(db: Database.Database, tables: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const table of tables) {
    const count = db.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`).get() as { n: number }
    counts.set(table, count.n)
  }
  return counts
}

function indexSheet(primary: string[], rest: string[], counts: Map<string, number>): ExcelSheet {
  return {
    name: '_tables',
    columns: ['table', 'rows'],
    rows: [...primary, ...rest].map((table) => [table, counts.get(table) ?? 0]),
  }
}

export function buildExcelSheets(db: Database.Database): ExcelSheet[] {
  const tables = listUserTables(db)
  const counts = tableRowCounts(db, tables)
  const { primary, rest } = partitionBackupTables(tables, (table) => counts.get(table) ?? 0)
  return [
    ...primary.map((table) => readTableSheet(db, table)),
    indexSheet(primary, rest, counts),
    ...rest.map((table) => readTableSheet(db, table)),
  ]
}

export function writeExcelBackupFromDatabase(db: Database.Database, destinationPath: string): void {
  writeXlsxFile(destinationPath, buildExcelSheets(db))
}

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve)
  })

/**
 * Same sheets as {@link buildExcelSheets}, but yields to the event loop between
 * tables. Reading every table is CPU work in the same process that serves the
 * UI, so on a large database the plain version can freeze the window.
 */
export async function buildExcelSheetsYielding(db: Database.Database): Promise<ExcelSheet[]> {
  const tables = listUserTables(db)
  const counts = tableRowCounts(db, tables)
  const { primary, rest } = partitionBackupTables(tables, (table) => counts.get(table) ?? 0)
  const sheets: ExcelSheet[] = []
  for (const table of primary) {
    sheets.push(readTableSheet(db, table))
    await yieldToEventLoop()
  }
  sheets.push(indexSheet(primary, rest, counts))
  for (const table of rest) {
    sheets.push(readTableSheet(db, table))
    await yieldToEventLoop()
  }
  return sheets
}

function removeSnapshotSidecars(dbPath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${dbPath}${suffix}`
    if (!existsSync(sidecar)) continue
    try {
      unlinkSync(sidecar)
    } catch {
      // A leftover sidecar is cleaned up on the next backup.
    }
  }
}

export async function writeExcelBackupFromDatabaseYielding(
  db: Database.Database,
  destinationPath: string,
): Promise<void> {
  writeXlsxFile(destinationPath, await buildExcelSheetsYielding(db))
}

export async function writeExcelBackupFromSqliteFile(
  dbPath: string,
  destinationPath = excelPathFor(dbPath),
): Promise<string> {
  const db = new Database(dbPath, sqliteNativeOptions({ readonly: true, fileMustExist: true }))
  try {
    await writeExcelBackupFromDatabaseYielding(db, destinationPath)
  } finally {
    db.close()
    removeSnapshotSidecars(dbPath)
  }
  return destinationPath
}
