import type Database from 'better-sqlite3'
import { replayPledge, type PledgeLedgerPaymentInput } from '@shared/billing/pledgeLedger'
import { loadPledgeTranches, type PledgeLedgerCore } from './ledger'

/**
 * One-time, idempotent backfill of pledge_payments from the legacy money ledger.
 *
 * Before the pledge_payments table existed, every collection was only a row in
 * customer_dues. This copies those rows across, replays the pledge to split each
 * one into interest and principal, and links the two rows together.
 */
export function backfillLegacyPledgePayments(db: Database.Database): void {
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pledge_payments'`)
    .get() as { name: string } | undefined
  if (!table) return

  const pledges = db
    .prepare(
      `SELECT id, customer_id, pledge_date, loan_amount, interest_pct, status, redeemed_date, amount_collected
       FROM pledges
       WHERE status != 'draft'`,
    )
    .all() as Array<PledgeLedgerCore & { amount_collected: number }>

  const paymentRowsStmt = db.prepare(
    `SELECT id, entry_date, amount, note FROM customer_dues
     WHERE pledge_id = ? AND kind = 'payment'
     ORDER BY entry_date ASC, id ASC`,
  )
  const hasPledgePayments = db.prepare('SELECT 1 FROM pledge_payments WHERE pledge_id = ? LIMIT 1')
  const insertPayment = db.prepare(
    `INSERT INTO pledge_payments (
       pledge_id, payment_date, kind, mode, amount, interest_part, principal_part, discount, note
     ) VALUES (?, ?, 'legacy', 'cash', ?, ?, ?, 0, ?)`,
  )
  const linkDue = db.prepare('UPDATE customer_dues SET pledge_payment_id = ? WHERE id = ?')

  const tx = db.transaction(() => {
    for (const pledge of pledges) {
      if (hasPledgePayments.get(pledge.id)) continue

      const dueRows = paymentRowsStmt.all(pledge.id) as Array<{
        id: number
        entry_date: string
        amount: number
        note: string
      }>

      let payments: PledgeLedgerPaymentInput[]
      if (dueRows.length > 0) {
        payments = dueRows.map((row) => ({
          date: row.entry_date,
          amount: row.amount,
          discount: 0,
        }))
      } else if (pledge.amount_collected > 0) {
        payments = [{ date: pledge.pledge_date, amount: pledge.amount_collected, discount: 0 }]
        dueRows.push({
          id: 0,
          entry_date: pledge.pledge_date,
          amount: pledge.amount_collected,
          note: '',
        })
      } else {
        continue
      }

      const { base, topups } = loadPledgeTranches(db, pledge)
      const result = replayPledge({
        base,
        topups,
        payments,
        asOfDate: payments[payments.length - 1]?.date ?? pledge.pledge_date,
      })

      result.allocations.forEach((allocation, index) => {
        const due = dueRows[index]
        const info = insertPayment.run(
          pledge.id,
          allocation.date,
          allocation.amount,
          allocation.interestPart,
          allocation.principalPart,
          due?.note ?? '',
        )
        if (due && due.id > 0) {
          linkDue.run(Number(info.lastInsertRowid), due.id)
        }
      })
    }
  })
  tx()
}
