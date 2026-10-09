import type Database from 'better-sqlite3'
import { addCalendarMonths, computeLateFee, goldWeightFromAmount, roundMoney } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type {
  GoldSavingAccountDetail,
  GoldSavingAccountInput,
  GoldSavingCancelInput,
  GoldSavingInitialPaymentInput,
  GoldSavingPaymentMode,
  GoldSavingRefund,
} from '@shared/types'
import { assertRateDateAccepted, datedRateForPurity } from './rateGuard'
import {
  ACCOUNT_SELECT,
  currentGoldBalance,
  insertLedger,
  LEDGER_SELECT,
  loadAccount,
  loadRefund,
  loadScheme,
  mapAccount,
  mapAudit,
  mapInstallment,
  mapLedger,
  mapPayment,
  mapRedemption,
  mapRefund,
  mapScheme,
  nextAccountNo,
  nextReceiptNo,
  paymentReceiptTotals,
  PAYMENT_SELECT,
  REDEMPTION_SELECT,
  REFUND_SELECT,
  writeAudit,
  type AccountRow,
  type AuditRow,
  type InstallmentRow,
  type LedgerRow,
  type PaymentRow,
  type RedemptionRow,
  type RefundRow,
  type SchemeRow,
} from './rows'

export function listAccounts(db: Database.Database, search?: string): ReturnType<typeof mapAccount>[] {
  const term = search?.trim() ?? ''
  const rows = term
    ? (db
        .prepare(
          `${ACCOUNT_SELECT}
           WHERE a.account_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR CAST(c.id AS TEXT) LIKE ?
           ORDER BY a.created_at DESC`,
        )
        .all(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`) as AccountRow[])
    : (db.prepare(`${ACCOUNT_SELECT} ORDER BY a.created_at DESC`).all() as AccountRow[])
  return rows.map(mapAccount)
}

export function getRefund(db: Database.Database, id: number): GoldSavingRefund {
  return mapRefund(loadRefund(db, id))
}

export function getAccountDetail(db: Database.Database, id: number): GoldSavingAccountDetail {
  const account = loadAccount(db, id)
  const scheme = loadScheme(db, account.scheme_id)
  const today = localTodayIso()
  const installments = (
    db
      .prepare('SELECT * FROM gold_saving_installments WHERE account_id = ? ORDER BY installment_no')
      .all(id) as InstallmentRow[]
  ).map((row) => mapInstallment(row, today))
  const payments = (db.prepare(`${PAYMENT_SELECT} WHERE p.account_id = ? ORDER BY p.id`).all(id) as PaymentRow[]).map(
    (row) => mapPayment(row, paymentReceiptTotals(db, row.id)),
  )
  const ledger = (
    db.prepare(`${LEDGER_SELECT} WHERE l.account_id = ? ORDER BY l.id`).all(id) as LedgerRow[]
  ).map(mapLedger)
  const redemptions = (
    db.prepare(`${REDEMPTION_SELECT} WHERE r.account_id = ? ORDER BY r.id`).all(id) as RedemptionRow[]
  ).map(mapRedemption)
  const refundRow = db
    .prepare(`${REFUND_SELECT} WHERE r.account_id = ? ORDER BY r.id DESC LIMIT 1`)
    .get(id) as RefundRow | undefined
  const audit = db
    .prepare(
      `SELECT * FROM gold_saving_audit_logs
       WHERE (entity_type = 'account' AND entity_id = ?)
          OR (entity_type IN ('payment', 'redemption') AND entity_id IN (
            SELECT id FROM gold_saving_payments WHERE account_id = ?
            UNION ALL
            SELECT id FROM gold_saving_redemptions WHERE account_id = ?
          ))
          OR (entity_type = 'installment' AND entity_id IN (
            SELECT id FROM gold_saving_installments WHERE account_id = ?
          ))
       ORDER BY id DESC`,
    )
    .all(id, id, id, id) as AuditRow[]

  return {
    account: mapAccount(account),
    scheme: mapScheme(scheme),
    installments,
    payments,
    ledger,
    redemptions,
    refund: refundRow ? mapRefund(refundRow) : null,
    audit: audit.map(mapAudit),
  }
}

export function postPaymentInTx(
  db: Database.Database,
  input: {
    accountId: number
    installmentId?: number
    paymentDate: string
    amount: number
    lateFee?: number
    discount?: number
    paymentMode: GoldSavingPaymentMode
    transactionRef?: string
    goldRate?: number
    goldRateOverrideReason?: string
    acceptRateDate?: boolean
    remarks?: string
    idempotencyKey?: string
    batchNo?: string
    createdBy: number | null
    isAdmin: boolean
  },
): number {
  if (input.idempotencyKey) {
    const existing = db
      .prepare('SELECT id, status FROM gold_saving_payments WHERE idempotency_key = ?')
      .get(input.idempotencyKey) as { id: number; status: string } | undefined
    if (existing) {
      if (existing.status === 'reversed') {
        throw new Error('This payment was reversed. Start a new collection instead of retrying it')
      }
      return existing.id
    }
  }

  const account = loadAccount(db, input.accountId)
  if (account.status !== 'active' && account.status !== 'matured') {
    throw new Error('Payments cannot be recorded on a closed scheme account')
  }
  const scheme = loadScheme(db, account.scheme_id)
  const installment = pickInstallment(db, account.id, input.installmentId, scheme.allow_missed_installments === 1)
  if (input.discount && input.discount > 0 && !input.isAdmin) {
    throw new Error('Only administrators can apply a collection discount')
  }

  const minAmount = scheme.min_installment ?? 0
  const maxAmount = scheme.max_installment ?? Number.POSITIVE_INFINITY
  if (minAmount > 0 && input.amount < minAmount) {
    throw new Error('Installment amount is below the scheme minimum')
  }
  if (input.amount > maxAmount) {
    throw new Error('Installment amount exceeds the scheme maximum')
  }

  if (scheme.allow_late_payments !== 1) {
    const grace = new Date(`${installment.due_date}T00:00:00`)
    grace.setDate(grace.getDate() + scheme.grace_period_days)
    const pay = new Date(`${input.paymentDate}T00:00:00`)
    if (pay > grace) {
      throw new Error('Late payments are not allowed for this scheme')
    }
  }

  const dated = datedRateForPurity(db, input.paymentDate, account.purity)
  const configuredRate = dated.rate
  let goldRate = configuredRate
  let goldRateSource = 'configured'
  let overrideBy: number | null = null
  const overrideReason = input.goldRateOverrideReason?.trim() ?? ''
  let manualOverride = false
  if (input.goldRate != null && roundMoney(input.goldRate) !== roundMoney(configuredRate)) {
    if (scheme.gold_rate_source !== 'manual_allowed') {
      throw new Error('Manual gold rates are not allowed for this scheme')
    }
    if (!input.isAdmin) {
      throw new Error('Permission denied to override the gold rate')
    }
    if (!overrideReason) {
      throw new Error('A reason is required when overriding the gold rate')
    }
    goldRate = input.goldRate
    goldRateSource = 'manual'
    overrideBy = input.createdBy
    manualOverride = true
  }
  if (!manualOverride) {
    assertRateDateAccepted(dated, input.paymentDate, {
      acceptRateDate: input.acceptRateDate,
      isAdmin: input.isAdmin,
    })
  }

  const computedLateFee = computeLateFee({
    dueDate: installment.due_date,
    paymentDate: input.paymentDate,
    graceDays: scheme.grace_period_days,
    type: scheme.late_fee_type,
    value: scheme.late_fee_value,
  })
  let lateFee = input.lateFee ?? computedLateFee
  if (input.lateFee != null && input.lateFee < computedLateFee) {
    if (!input.isAdmin) {
      throw new Error('Only administrators can reduce the late fee')
    }
  }
  if (lateFee < 0) {
    lateFee = 0
  }
  const discount = input.discount ?? 0
  const totalReceived = roundMoney(input.amount + lateFee - discount)
  if (totalReceived <= 0) {
    throw new Error('Total amount received must be greater than zero')
  }
  const goldWeight = goldWeightFromAmount(input.amount, goldRate)
  const receiptNo = nextReceiptNo(db, 'GSR')

  const result = db
    .prepare(
      `INSERT INTO gold_saving_payments (
        account_id, installment_id, receipt_no, installment_no, payment_date, due_date,
        amount, late_fee, discount, total_received, gold_rate, gold_weight,
        gold_rate_source, gold_rate_override_reason, gold_rate_override_by, purity,
        payment_mode, transaction_ref, remarks, status, idempotency_key, batch_no, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?)`,
    )
    .run(
      account.id,
      installment.id,
      receiptNo,
      installment.installment_no,
      input.paymentDate,
      installment.due_date,
      input.amount,
      lateFee,
      discount,
      totalReceived,
      goldRate,
      goldWeight,
      goldRateSource,
      overrideReason,
      overrideBy,
      account.purity,
      input.paymentMode,
      input.transactionRef ?? '',
      input.remarks ?? '',
      input.idempotencyKey ?? null,
      input.batchNo ?? null,
      input.createdBy,
    )
  const paymentId = Number(result.lastInsertRowid)

  db.prepare(
    `UPDATE gold_saving_installments SET status = 'paid', paid_at = ? WHERE id = ?`,
  ).run(input.paymentDate, installment.id)

  insertLedger(db, {
    accountId: account.id,
    entryDate: input.paymentDate,
    entryType: 'payment',
    paymentId,
    amount: input.amount,
    goldWeight,
    goldRate,
    txnRef: receiptNo,
    notes: input.remarks ?? '',
    createdBy: input.createdBy,
  })

  refreshAccountStatus(db, account.id)
  writeAudit(db, {
    entityType: 'payment',
    entityId: paymentId,
    action: goldRateSource === 'manual' ? 'collect_manual_rate' : 'collect',
    changedBy: input.createdBy,
    after: { receiptNo, amount: input.amount, goldRate, goldWeight },
  })
  return paymentId
}

function pickInstallment(
  db: Database.Database,
  accountId: number,
  installmentId: number | undefined,
  allowMissed: boolean,
): InstallmentRow {
  const rows = db
    .prepare(
      `SELECT * FROM gold_saving_installments
       WHERE account_id = ? AND status NOT IN ('paid', 'waived')
       ORDER BY installment_no`,
    )
    .all(accountId) as InstallmentRow[]
  if (rows.length === 0) {
    throw new Error('No eligible installment remains on this account')
  }
  if (!installmentId) {
    return rows[0]
  }
  const chosen = rows.find((row) => row.id === installmentId)
  if (!chosen) {
    throw new Error('This installment is not eligible for collection')
  }
  if (!allowMissed && chosen.id !== rows[0].id) {
    throw new Error('Collect the next unpaid installment before skipping ahead')
  }
  return chosen
}

export function refreshAccountStatus(db: Database.Database, accountId: number): void {
  const account = db
    .prepare('SELECT id, status, maturity_date, duration_months FROM gold_saving_accounts WHERE id = ?')
    .get(accountId) as {
    id: number
    status: string
    maturity_date: string
    duration_months: number
  }
  if (account.status === 'cancelled' || account.status === 'redeemed' || account.status === 'closed') {
    return
  }
  const paid = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM gold_saving_installments WHERE account_id = ? AND status IN ('paid', 'waived')`,
      )
      .get(accountId) as { count: number }
  ).count
  const today = localTodayIso()
  const nextStatus = paid >= account.duration_months || today >= account.maturity_date ? 'matured' : 'active'
  db.prepare(`UPDATE gold_saving_accounts SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    nextStatus,
    accountId,
  )
}

export function waiveInstallment(
  db: Database.Database,
  installmentId: number,
  reason: string,
  user: { id: number; isAdmin: boolean },
): GoldSavingAccountDetail {
  if (!user.isAdmin) {
    throw new Error('Only administrators can waive an installment')
  }
  const tx = db.transaction(() => {
    const installment = db
      .prepare('SELECT * FROM gold_saving_installments WHERE id = ?')
      .get(installmentId) as InstallmentRow | undefined
    if (!installment) throw new Error('Installment not found')
    const account = loadAccount(db, installment.account_id)
    if (account.status === 'cancelled' || account.status === 'closed' || account.status === 'redeemed') {
      throw new Error('This scheme account cannot be modified')
    }
    if (installment.status === 'paid') {
      throw new Error('This installment is already paid')
    }
    if (installment.status === 'waived') {
      throw new Error('This installment is already waived')
    }
    db.prepare(`UPDATE gold_saving_installments SET status = 'waived', paid_at = NULL WHERE id = ?`).run(
      installmentId,
    )
    writeAudit(db, {
      entityType: 'installment',
      entityId: installmentId,
      action: 'waive',
      changedBy: user.id,
      before: { status: installment.status },
      after: { status: 'waived', reason },
    })
    refreshAccountStatus(db, installment.account_id)
    return installment.account_id
  })
  return getAccountDetail(db, tx())
}

export function enrollAccount(
  db: Database.Database,
  input: GoldSavingAccountInput,
  user: { id: number; isAdmin: boolean },
): GoldSavingAccountDetail {
  const tx = db.transaction(() => {
    const scheme = loadScheme(db, input.schemeId)
    if (scheme.status !== 'active') {
      throw new Error('Cannot enroll into an inactive scheme')
    }
    const today = localTodayIso()
    if (scheme.available_from && input.enrollmentDate < scheme.available_from) {
      throw new Error('This scheme is not yet available')
    }
    if (scheme.available_to && input.enrollmentDate > scheme.available_to) {
      throw new Error('This scheme is no longer available')
    }
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(input.customerId) as
      | { id: number }
      | undefined
    if (!customer) throw new Error('Customer not found')

    if (scheme.allow_multiple_accounts !== 1) {
      const existing = db
        .prepare(
          `SELECT id FROM gold_saving_accounts
           WHERE customer_id = ? AND scheme_id = ? AND status IN ('active', 'matured')
           LIMIT 1`,
        )
        .get(input.customerId, scheme.id) as { id: number } | undefined
      if (existing) {
        throw new Error('Customer already has an active account in this scheme')
      }
    }

    const monthlyAmount = input.monthlyAmount ?? scheme.monthly_amount
    const minAmount = scheme.min_installment ?? 0
    const maxAmount = scheme.max_installment ?? Number.POSITIVE_INFINITY
    if (minAmount > 0 && monthlyAmount < minAmount) {
      throw new Error('Monthly installment is below the scheme minimum')
    }
    if (monthlyAmount > maxAmount) {
      throw new Error('Monthly installment exceeds the scheme maximum')
    }

    const maturityDate = addCalendarMonths(input.firstInstallmentDate, scheme.duration_months - 1)
    const accountNo = nextAccountNo(db, input.enrollmentDate)
    const result = db
      .prepare(
        `INSERT INTO gold_saving_accounts (
          account_no, customer_id, scheme_id, monthly_amount, duration_months, purity,
          enrollment_date, first_installment_date, maturity_date, preferred_payment_day,
          nominee_name, nominee_relationship, nominee_phone, terms_accepted, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?)`,
      )
      .run(
        accountNo,
        input.customerId,
        scheme.id,
        monthlyAmount,
        scheme.duration_months,
        scheme.purity,
        input.enrollmentDate,
        input.firstInstallmentDate,
        maturityDate,
        input.preferredPaymentDay ?? null,
        input.nomineeName ?? '',
        input.nomineeRelationship ?? '',
        input.nomineePhone ?? '',
        user.id,
      )
    const accountId = Number(result.lastInsertRowid)

    const insertInstallment = db.prepare(
      `INSERT INTO gold_saving_installments (account_id, installment_no, due_date, amount, status)
       VALUES (?, ?, ?, ?, ?)`,
    )
    for (let n = 1; n <= scheme.duration_months; n += 1) {
      const dueDate = addCalendarMonths(input.firstInstallmentDate, n - 1)
      const status = dueDate <= today ? 'due' : 'upcoming'
      insertInstallment.run(accountId, n, dueDate, monthlyAmount, status)
    }

    writeAudit(db, {
      entityType: 'account',
      entityId: accountId,
      action: 'enroll',
      changedBy: user.id,
      after: { accountNo, customerId: input.customerId, schemeId: scheme.id },
    })

    if (input.initialPayment) {
      const first = db
        .prepare(
          `SELECT id FROM gold_saving_installments WHERE account_id = ? AND installment_no = 1`,
        )
        .get(accountId) as { id: number }
      postInitial(db, accountId, first.id, {
        ...input.initialPayment,
        acceptRateDate: input.initialPayment.acceptRateDate ?? input.acceptRateDate,
      }, user)
    }

    return accountId
  })
  return getAccountDetail(db, tx())
}

function postInitial(
  db: Database.Database,
  accountId: number,
  installmentId: number,
  payment: GoldSavingInitialPaymentInput,
  user: { id: number; isAdmin: boolean },
): void {
  postPaymentInTx(db, {
    accountId,
    installmentId,
    paymentDate: payment.paymentDate,
    amount: payment.amount,
    paymentMode: payment.paymentMode,
    transactionRef: payment.transactionRef,
    goldRate: payment.goldRate,
    goldRateOverrideReason: payment.goldRateOverrideReason,
    acceptRateDate: payment.acceptRateDate,
    remarks: payment.remarks,
    idempotencyKey: payment.idempotencyKey,
    createdBy: user.id,
    isAdmin: user.isAdmin,
  })
}

function computeRefundDeduction(
  scheme: SchemeRow,
  totalPaid: number,
  override: number | undefined,
): number {
  if (override != null) {
    return roundMoney(Math.min(Math.max(override, 0), totalPaid))
  }
  if (scheme.cancel_deduction_type === 'percentage') {
    return roundMoney((totalPaid * scheme.cancel_deduction_value) / 100)
  }
  if (scheme.cancel_deduction_type === 'fixed') {
    return roundMoney(Math.min(scheme.cancel_deduction_value, totalPaid))
  }
  return 0
}

export function cancelAccount(
  db: Database.Database,
  id: number,
  input: GoldSavingCancelInput,
  user: { id: number; isAdmin: boolean },
): GoldSavingAccountDetail {
  const tx = db.transaction(() => {
    const account = loadAccount(db, id)
    if (account.status === 'cancelled' || account.status === 'closed' || account.status === 'redeemed') {
      throw new Error('This scheme account is already closed')
    }
    const redemptionCount = (
      db.prepare('SELECT COUNT(*) AS count FROM gold_saving_redemptions WHERE account_id = ?').get(id) as {
        count: number
      }
    ).count
    if (redemptionCount > 0) {
      throw new Error('Cancellation is not allowed after a redemption')
    }
    if (input.deductionOverride != null && !user.isAdmin) {
      throw new Error('Only administrators can override the cancellation deduction')
    }
    const scheme = loadScheme(db, account.scheme_id)
    const totalPaid = roundMoney(
      (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) AS paid FROM gold_saving_payments
             WHERE account_id = ? AND status = 'posted'`,
          )
          .get(id) as { paid: number }
      ).paid,
    )
    const deduction = computeRefundDeduction(scheme, totalPaid, input.deductionOverride)
    const refundAmount = roundMoney(totalPaid - deduction)
    const goldForfeited = currentGoldBalance(db, id)
    const refundDate = input.refundDate ?? localTodayIso()
    const voucherNo = nextReceiptNo(db, 'GSRF')

    db.prepare(
      `INSERT INTO gold_saving_refunds (
        account_id, voucher_no, refund_date, total_paid, deduction, refund_amount,
        payment_mode, transaction_ref, gold_forfeited, reason, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      voucherNo,
      refundDate,
      totalPaid,
      deduction,
      refundAmount,
      input.paymentMode ?? 'cash',
      input.transactionRef ?? '',
      goldForfeited,
      input.reason,
      user.id,
    )

    if (goldForfeited !== 0 || refundAmount !== 0) {
      insertLedger(db, {
        accountId: id,
        entryDate: refundDate,
        entryType: 'refund',
        amount: -refundAmount,
        goldWeight: -goldForfeited,
        goldRate: 0,
        txnRef: voucherNo,
        notes: input.reason,
        createdBy: user.id,
      })
    }

    db.prepare(
      `UPDATE gold_saving_accounts SET status = 'cancelled', closed_at = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(refundDate, id)

    writeAudit(db, {
      entityType: 'account',
      entityId: id,
      action: 'cancel',
      changedBy: user.id,
      before: { status: account.status, totalPaid, goldForfeited },
      after: { status: 'cancelled', voucherNo, deduction, refundAmount, reason: input.reason },
    })
  })
  tx()
  return getAccountDetail(db, id)
}

