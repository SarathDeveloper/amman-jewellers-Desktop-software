import type Database from 'better-sqlite3'
import type { GoldSavingPayment, GoldSavingPaymentInput } from '@shared/types'
import { postPaymentInTx } from './accountService'
import {
  insertLedger,
  loadPayment,
  mapPayment,
  paymentReceiptTotals,
  writeAudit,
} from './rows'

export function getPayment(db: Database.Database, id: number): GoldSavingPayment {
  const row = loadPayment(db, id)
  return mapPayment(row, paymentReceiptTotals(db, id))
}

export function collectPayment(
  db: Database.Database,
  input: GoldSavingPaymentInput,
  user: { id: number; isAdmin: boolean },
): GoldSavingPayment {
  const tx = db.transaction(() =>
    postPaymentInTx(db, {
      accountId: input.accountId,
      installmentId: input.installmentId,
      paymentDate: input.paymentDate,
      amount: input.amount,
      lateFee: input.lateFee,
      discount: input.discount,
      paymentMode: input.paymentMode,
      transactionRef: input.transactionRef,
      goldRate: input.goldRate,
      goldRateOverrideReason: input.goldRateOverrideReason,
      remarks: input.remarks,
      idempotencyKey: input.idempotencyKey,
      createdBy: user.id,
      isAdmin: user.isAdmin,
    }),
  )
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
    db.prepare(
      `UPDATE gold_saving_accounts SET status = 'active', closed_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND status IN ('matured', 'active')`,
    ).run(payment.account_id)
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

