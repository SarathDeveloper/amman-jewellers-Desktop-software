import type { Database } from 'better-sqlite3'
import { roundMoney } from '@shared/billing/pricing'

type Db = Database

export interface PurchaseBalanceOptions {
  /** Ignore links that belong to this invoice, so a bill can re-save itself. */
  excludeInvoiceId?: number
}

export interface PurchaseBalance {
  total: number
  paidOut: number
  applied: number
  balance: number
}

function emptyBalance(): PurchaseBalance {
  return { total: 0, paidOut: 0, applied: 0, balance: 0 }
}

/**
 * A purchase's value is drawn down by payouts (cash / UPI / bank to the
 * customer) and by bill links. The remaining balance is always derived here so
 * there is one source of truth.
 */
export function getPurchaseBalance(
  db: Db,
  purchaseId: number,
  options: PurchaseBalanceOptions = {},
): PurchaseBalance {
  const purchase = db
    .prepare('SELECT total_amount AS total, status FROM old_gold_purchases WHERE id = ?')
    .get(purchaseId) as { total: number; status: string } | undefined
  if (!purchase) {
    return emptyBalance()
  }

  const paidOut = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM old_gold_payouts
       WHERE purchase_id = ? AND voided_at IS NULL`,
    )
    .get(purchaseId) as { total: number }

  const applied = options.excludeInvoiceId
    ? (db
        .prepare(
          `SELECT COALESCE(SUM(amount_applied), 0) AS total
           FROM invoice_old_gold_links
           WHERE purchase_id = ? AND invoice_id != ?`,
        )
        .get(purchaseId, options.excludeInvoiceId) as { total: number })
    : (db
        .prepare(
          `SELECT COALESCE(SUM(amount_applied), 0) AS total
           FROM invoice_old_gold_links
           WHERE purchase_id = ?`,
        )
        .get(purchaseId) as { total: number })

  const total = roundMoney(purchase.total)
  const paid = roundMoney(paidOut.total)
  const used = roundMoney(applied.total)
  return {
    total,
    paidOut: paid,
    applied: used,
    balance: roundMoney(Math.max(0, total - paid - used)),
  }
}

/** Batch form for list views, one query per source instead of per purchase. */
export function getPurchaseBalances(
  db: Db,
  purchaseIds: number[],
): Map<number, PurchaseBalance> {
  const result = new Map<number, PurchaseBalance>()
  if (purchaseIds.length === 0) return result

  const placeholders = purchaseIds.map(() => '?').join(', ')
  const totals = db
    .prepare(
      `SELECT id, total_amount AS total FROM old_gold_purchases WHERE id IN (${placeholders})`,
    )
    .all(...purchaseIds) as Array<{ id: number; total: number }>
  const payouts = db
    .prepare(
      `SELECT purchase_id AS id, COALESCE(SUM(amount), 0) AS total
       FROM old_gold_payouts
       WHERE voided_at IS NULL AND purchase_id IN (${placeholders})
       GROUP BY purchase_id`,
    )
    .all(...purchaseIds) as Array<{ id: number; total: number }>
  const links = db
    .prepare(
      `SELECT purchase_id AS id, COALESCE(SUM(amount_applied), 0) AS total
       FROM invoice_old_gold_links
       WHERE purchase_id IN (${placeholders})
       GROUP BY purchase_id`,
    )
    .all(...purchaseIds) as Array<{ id: number; total: number }>

  const payoutMap = new Map(payouts.map((row) => [row.id, row.total]))
  const linkMap = new Map(links.map((row) => [row.id, row.total]))
  for (const row of totals) {
    const total = roundMoney(row.total)
    const paid = roundMoney(payoutMap.get(row.id) ?? 0)
    const used = roundMoney(linkMap.get(row.id) ?? 0)
    result.set(row.id, {
      total,
      paidOut: paid,
      applied: used,
      balance: roundMoney(Math.max(0, total - paid - used)),
    })
  }
  return result
}
