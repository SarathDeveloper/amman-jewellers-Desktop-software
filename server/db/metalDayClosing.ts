import type { Database } from 'better-sqlite3'
import { getDatabase } from '../db'

export function isMetalDayClosed(
  db: Database,
  businessDate: string,
  metal: string,
): boolean {
  const row = db
    .prepare(
      `SELECT status FROM metal_day_closings
       WHERE business_date = ? AND lower(trim(metal)) = lower(trim(?))`,
    )
    .get(businessDate, metal) as { status: string } | undefined
  return row?.status === 'closed'
}

export function assertMetalDayOpen(
  db: Database,
  businessDate: string,
  metal: string,
): void {
  if (isMetalDayClosed(db, businessDate, metal)) {
    throw new Error(
      `Cannot change stock for ${metal} on ${businessDate}: that metal day is closed`,
    )
  }
}

export function assertMetalsOpenForDate(
  db: Database,
  businessDate: string,
  metals: Iterable<string>,
): void {
  const seen = new Set<string>()
  for (const metal of metals) {
    const key = metal.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    assertMetalDayOpen(db, businessDate, metal.trim())
  }
}

export function getDatabaseOr(db?: Database): Database {
  return db ?? getDatabase()
}
