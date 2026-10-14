import type Database from 'better-sqlite3'

function inwardPrefix(inwardDate: string): string {
  const year = inwardDate.slice(0, 4)
  return `IN-${/^\d{4}$/.test(year) ? year : new Date().getFullYear()}-`
}

export function inwardNoPrefix(inwardDate: string): string {
  return inwardPrefix(inwardDate)
}

/** Uses a numeric max so the series keeps counting past 9999 (a text sort puts "-10000" before "-9999"). */
export function nextInwardNo(db: Database.Database, inwardDate: string): string {
  const prefix = inwardPrefix(inwardDate)
  const row = db
    .prepare(
      `SELECT MAX(CAST(substr(inward_no, ?) AS INTEGER)) AS max_seq
       FROM inwards
       WHERE inward_no LIKE ?`,
    )
    .get(prefix.length + 1, `${prefix}%`) as { max_seq: number | null } | undefined
  const next = (row?.max_seq ?? 0) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}
