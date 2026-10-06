import Database from 'better-sqlite3'
import { sqliteNativeOptions } from '../lib/sqliteNative'
import { writeXlsxFile, type ExcelSheet } from '../lib/xlsxWorkbook'

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

export function buildExcelSheets(db: Database.Database): ExcelSheet[] {
  const tables = listUserTables(db)
  const sheets: ExcelSheet[] = [
    {
      name: '_tables',
      columns: ['table', 'rows'],
      rows: tables.map((table) => {
        const count = db.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`).get() as { n: number }
        return [table, count.n]
      }),
    },
  ]
  for (const table of tables) {
    sheets.push(readTableSheet(db, table))
  }
  return sheets
}

export function writeExcelBackupFromDatabase(db: Database.Database, destinationPath: string): void {
  writeXlsxFile(destinationPath, buildExcelSheets(db))
}

export function writeExcelBackupFromSqliteFile(dbPath: string, destinationPath = excelPathFor(dbPath)): string {
  const db = new Database(dbPath, sqliteNativeOptions({ readonly: true, fileMustExist: true }))
  try {
    writeExcelBackupFromDatabase(db, destinationPath)
  } finally {
    db.close()
  }
  return destinationPath
}
