import type { PledgeTopup } from '@shared/types'
import { pledgeAmountDueWithTopups, type PledgeTopupSlice } from '@shared/billing/pledgeMath'
import type Database from 'better-sqlite3'

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

export function topupSlices(topups: PledgeTopup[]): PledgeTopupSlice[] {
  return topups.map((topup) => ({
    amount: topup.amount,
    topupDate: topup.topupDate,
    interestPct: topup.interestPct,
  }))
}

export function computePledgeDueWithLoadedTopups(
  db: Database.Database,
  pledge: {
    id: number
    loan_amount: number
    interest_pct: number
    pledge_date: string
    amount_collected: number
  },
  asOfDate: string,
) {
  const topups = loadPledgeTopups(db, pledge.id)
  return {
    topups,
    due: pledgeAmountDueWithTopups(
      pledge.loan_amount,
      topupSlices(topups),
      pledge.interest_pct,
      pledge.pledge_date,
      asOfDate,
      pledge.amount_collected,
    ),
  }
}
