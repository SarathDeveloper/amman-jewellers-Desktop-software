import type Database from 'better-sqlite3'
import type { PledgeTopup } from '@shared/types'

type PledgeTopupRow = {
  id: number
  pledge_id: number
  topup_date: string
  amount: number
  interest_pct: number
  note: string
  created_at: string
}

export function mapPledgeTopup(row: PledgeTopupRow): PledgeTopup {
  return {
    id: row.id,
    pledgeId: row.pledge_id,
    topupDate: row.topup_date,
    amount: row.amount,
    interestPct: row.interest_pct,
    note: row.note ?? '',
    createdAt: row.created_at,
  }
}

export function loadPledgeTopups(db: Database.Database, pledgeId: number): PledgeTopup[] {
  const rows = db
    .prepare(
      `SELECT id, pledge_id, topup_date, amount, interest_pct, note, created_at
       FROM pledge_topups
       WHERE pledge_id = ?
       ORDER BY topup_date ASC, id ASC`,
    )
    .all(pledgeId) as PledgeTopupRow[]
  return rows.map(mapPledgeTopup)
}
