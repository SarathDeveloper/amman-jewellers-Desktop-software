import type Database from 'better-sqlite3'
import { roundMoney } from '@shared/billing/pricing'
import { loadPledgeCore, pledgeAsOfDate, replayForPledge } from '../pledges/ledger'

/**
 * Keep the money ledger (`customer_dues`) in step with a pledge.
 *
 * The single `due` row holds the total cost of the loan to date
 * (principal + interest - discounts). Every collection is a `payment` row, so
 * the customer's balance is always `due - payments`.
 */
export function syncDueEntryForPledge(db: Database.Database, pledgeId: number): void {
  const pledge = loadPledgeCore(db, pledgeId)
  if (!pledge) return

  const receipt = db
    .prepare('SELECT receipt_no FROM pledges WHERE id = ?')
    .get(pledgeId) as { receipt_no: string } | undefined
  if (!receipt) return

  const asOf = pledgeAsOfDate(pledge)
  const { result } = replayForPledge(db, pledge, asOf)
  const note = `Adagu ${receipt.receipt_no}`

  const existingDue = db
    .prepare(`SELECT id FROM customer_dues WHERE pledge_id = ? AND kind = 'due'`)
    .get(pledgeId) as { id: number } | undefined

  if (existingDue) {
    db.prepare(`UPDATE customer_dues SET amount = ?, note = ? WHERE id = ?`).run(
      result.grossDue,
      note,
      existingDue.id,
    )
  } else if (pledge.status === 'active' || result.grossDue > 0) {
    db.prepare(
      `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, pledge_id, created_at)
       VALUES (?, ?, 'due', ?, ?, ?, datetime('now'))`,
    ).run(pledge.customer_id, pledge.pledge_date, result.grossDue, note, pledgeId)
  }

  // Safety net: keep the money ledger equal to the detailed payment ledger.
  const paidRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS paid
       FROM customer_dues WHERE pledge_id = ? AND kind = 'payment'`,
    )
    .get(pledgeId) as { paid: number }
  const collectedRow = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM pledge_payments WHERE pledge_id = ?')
    .get(pledgeId) as { n: number }

  const gap = roundMoney(Math.max(0, collectedRow.n - paidRow.paid))
  if (gap > 1e-9) {
    db.prepare(
      `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, pledge_id, created_at)
       VALUES (?, ?, 'payment', ?, ?, ?, datetime('now'))`,
    ).run(pledge.customer_id, asOf, gap, `Partial payment ${note}`, pledgeId)
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
