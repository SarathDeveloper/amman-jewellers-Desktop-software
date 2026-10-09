import type Database from 'better-sqlite3'
import type { GoldSavingPayment, GoldSavingPaymentInput } from '@shared/types'
import { postPaymentInTx, refreshAccountStatus } from './accountService'
import {
  insertLedger,
  loadAccount,
  loadPayment,
  mapPayment,
  nextBatchNo,
  PAYMENT_SELECT,
  paymentReceiptTotals,
  writeAudit,
  type PaymentRow,
} from './rows'

export function getPayment(db: Database.Database, id: number): GoldSavingPayment {
  const row = loadPayment(db, id)
  const payment = mapPayment(row, paymentReceiptTotals(db, id))
  if (row.batch_no) {
    const siblings = db
      .prepare(`${PAYMENT_SELECT} WHERE p.batch_no = ? ORDER BY p.installment_no`)
      .all(row.batch_no) as PaymentRow[]
    if (siblings.length > 1) {
      payment.batchPayments = siblings.map((sibling) =>
        mapPayment(sibling, paymentReceiptTotals(db, sibling.id)),
      )
    }
  }
  return payment
}

/**
 * Collects one or more installments in a single transaction.
 *
 * A batch starts at the first unpaid installment, or at `installmentId` when
 * given, and runs in installment order. Every row shares one `batch_no` so a
 * receipt fetched by any of them lists the whole batch. Each row computes its
 * own late fee, because the installments have different due dates; the batch's
 * idempotency key is suffixed per row so a retry replays the same rows.
 */
export function collectPayment(
  db: Database.Database,
  input: GoldSavingPaymentInput,
  user: { id: number; isAdmin: boolean },
): GoldSavingPayment {
  const requested = Math.max(1, Math.trunc(input.installmentCount ?? 1))
  const tx = db.transaction(() => {
    // A retry of the same collection must return the original payment even
    // though its installments are now paid, so the batch's first idempotency
    // key is resolved before the unpaid list is read.
    const firstKey = input.idempotencyKey
      ? requested > 1
        ? `${input.idempotencyKey}-1`
        : input.idempotencyKey
      : undefined
    if (firstKey) {
      const existing = db
        .prepare('SELECT id, status FROM gold_saving_payments WHERE idempotency_key = ?')
        .get(firstKey) as { id: number; status: string } | undefined
      if (existing) {
        if (existing.status === 'reversed') {
          throw new Error('This payment was reversed. Start a new collection instead of retrying it')
        }
        return existing.id
      }
    }

    const unpaid = db
      .prepare(
        `SELECT id FROM gold_saving_installments
         WHERE account_id = ? AND status NOT IN ('paid', 'waived')
         ORDER BY installment_no`,
      )
      .all(input.accountId) as { id: number }[]
    if (unpaid.length === 0) {
      throw new Error('No eligible installment remains on this account')
    }
    let start = 0
    if (input.installmentId != null) {
      const index = unpaid.findIndex((row) => row.id === input.installmentId)
      if (index === -1) {
        throw new Error('This installment is not eligible for collection')
      }
      start = index
    }
    if (requested > unpaid.length - start) {
      throw new Error(`Only ${unpaid.length - start} installment(s) remain on this account`)
    }
    const targets = unpaid.slice(start, start + requested)
    const batchNo = targets.length > 1 ? nextBatchNo(db) : undefined

    const ids: number[] = []
    targets.forEach((target, index) => {
      const single = targets.length === 1
      ids.push(
        postPaymentInTx(db, {
          accountId: input.accountId,
          installmentId: target.id,
          paymentDate: input.paymentDate,
          amount: input.amount,
          // A batch covers installments with different due dates, so each row
          // computes its own late fee. A single collection keeps the edited fee.
          lateFee: single ? input.lateFee : undefined,
          // A discount belongs to the collection, so it lands on the first row.
          discount: index === 0 ? input.discount : 0,
          paymentMode: input.paymentMode,
          transactionRef: input.transactionRef,
          goldRate: input.goldRate,
          goldRateOverrideReason: input.goldRateOverrideReason,
          acceptRateDate: input.acceptRateDate,
          remarks: input.remarks,
          idempotencyKey: batchNo
            ? input.idempotencyKey
              ? `${input.idempotencyKey}-${index + 1}`
              : undefined
            : input.idempotencyKey,
          batchNo,
          createdBy: user.id,
          isAdmin: user.isAdmin,
        }),
      )
    })
    return ids[0]
  })
  return getPayment(db, tx())
}

export function reversePayment(
  db: Database.Database,
  id: number,
  reason: string,
  userId: number,
): GoldSavingPayment {
  const tx = db.transaction(() => {
    const payment = loadPayment(db, id)
    if (payment.status === 'reversed') {
      throw new Error('This payment is already reversed')
    }
    const account = loadAccount(db, payment.account_id)
    if (account.status === 'redeemed' || account.status === 'cancelled' || account.status === 'closed') {
      throw new Error('Cannot reverse a payment on a closed scheme account')
    }
    const redemption = db
      .prepare('SELECT id FROM gold_saving_redemptions WHERE account_id = ? LIMIT 1')
      .get(payment.account_id) as { id: number } | undefined
    if (redemption) {
      throw new Error('Cannot reverse a payment after the account has been redeemed')
    }
    db.prepare(`UPDATE gold_saving_payments SET status = 'reversed' WHERE id = ?`).run(id)
    if (payment.installment_id) {
      db.prepare(
        `UPDATE gold_saving_installments SET status = 'due', paid_at = NULL WHERE id = ?`,
      ).run(payment.installment_id)
    }
    insertLedger(db, {
      accountId: payment.account_id,
      entryDate: payment.payment_date,
      entryType: 'reversal',
      paymentId: payment.id,
      amount: -payment.amount,
      goldWeight: -payment.gold_weight,
      goldRate: payment.gold_rate,
      txnRef: `${payment.receipt_no}-REV`,
      notes: reason,
      createdBy: userId,
    })
    refreshAccountStatus(db, payment.account_id)
    writeAudit(db, {
      entityType: 'payment',
      entityId: payment.id,
      action: 'reverse',
      changedBy: userId,
      before: { status: 'posted' },
      after: { status: 'reversed', reason },
    })
    return payment.id
  })
  tx()
  return getPayment(db, id)
}

