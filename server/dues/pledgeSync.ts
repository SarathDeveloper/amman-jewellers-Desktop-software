import type Database from 'better-sqlite3'
import { roundMoney } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import { computePledgeDueWithLoadedTopups } from '../pledges/topups'

type PledgeDueRow = {
  id: number
  customer_id: number
  receipt_no: string
  pledge_date: string
  loan_amount: number
  interest_pct: number
  amount_collected: number
  status: string
  redeemed_date: string | null
}

function asOfDate(pledge: PledgeDueRow): string {
  if (pledge.status === 'active') {
    return localTodayIso()
  }
  return pledge.redeemed_date || localTodayIso()
}

export function syncDueEntryForPledge(db: Database.Database, pledgeId: number): void {
  const pledge = db
    .prepare(
      `SELECT id, customer_id, receipt_no, pledge_date, loan_amount, interest_pct,
              amount_collected, status, redeemed_date
       FROM pledges WHERE id = ?`,
    )
    .get(pledgeId) as PledgeDueRow | undefined

  if (!pledge) {
    return
  }

  const { due } = computePledgeDueWithLoadedTopups(db, pledge, asOfDate(pledge))

  if (due.totalDue <= 0) {
    return
  }

  const note = `Adagu ${pledge.receipt_no}`
  const existingDue = db
    .prepare(`SELECT id FROM customer_dues WHERE pledge_id = ? AND kind = 'due'`)
    .get(pledgeId) as { id: number } | undefined

  if (existingDue) {
    db.prepare(`UPDATE customer_dues SET amount = ?, note = ? WHERE id = ?`).run(
      due.totalDue,
      note,
      existingDue.id,
    )
  } else if (pledge.status === 'active' || due.remaining > 0) {
    db.prepare(
      `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, pledge_id, created_at)
       VALUES (?, ?, 'due', ?, ?, ?, datetime('now'))`,
    ).run(pledge.customer_id, pledge.pledge_date, due.totalDue, note, pledgeId)
  }

  const paidRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS paid
       FROM customer_dues
       WHERE pledge_id = ? AND kind = 'payment'`,
    )
    .get(pledgeId) as { paid: number }

  const gap = roundMoney(Math.max(0, pledge.amount_collected - paidRow.paid))
  if (gap > 1e-9) {
    db.prepare(
      `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, pledge_id, created_at)
       VALUES (?, ?, 'payment', ?, ?, ?, datetime('now'))`,
    ).run(
      pledge.customer_id,
      asOfDate(pledge),
      gap,
      `Partial payment ${note}`,
      pledgeId,
    )
  }
}

export function refreshActivePledgeDues(db: Database.Database): void {
  const tx = db.transaction(() => {
    const rows = db.prepare(`SELECT id FROM pledges WHERE status = 'active'`).all() as Array<{
      id: number
    }>
    for (const row of rows) {
      syncDueEntryForPledge(db, row.id)
    }
  })
  tx()
}
