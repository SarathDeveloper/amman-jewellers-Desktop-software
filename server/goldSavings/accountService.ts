import type Database from 'better-sqlite3'
import { addCalendarMonths, goldWeightFromAmount, rateForPurity, roundMoney } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type {
  GoldSavingAccountDetail,
  GoldSavingAccountInput,
  GoldSavingInitialPaymentInput,
  GoldSavingPaymentMode,
} from '@shared/types'
import { getLatestMetalRates } from '../routes/metalRates.routes'
import {
  ACCOUNT_SELECT,
  insertLedger,
  LEDGER_SELECT,
  loadAccount,
  loadScheme,
  mapAccount,
  mapAudit,
  mapInstallment,
  mapLedger,
  mapPayment,
  mapRedemption,
  mapScheme,
  nextAccountNo,
  nextReceiptNo,
  paymentReceiptTotals,
  PAYMENT_SELECT,
  REDEMPTION_SELECT,
  writeAudit,
  type AccountRow,
  type AuditRow,
  type InstallmentRow,
  type LedgerRow,
  type PaymentRow,
  type RedemptionRow,
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
  const audit = db
    .prepare(
      `SELECT * FROM gold_saving_audit_logs
       WHERE (entity_type = 'account' AND entity_id = ?)
          OR (entity_type IN ('payment', 'redemption') AND entity_id IN (
            SELECT id FROM gold_saving_payments WHERE account_id = ?
            UNION ALL
            SELECT id FROM gold_saving_redemptions WHERE account_id = ?
          ))
       ORDER BY id DESC`,
    )
    .all(id, id, id) as AuditRow[]

  return {
    account: mapAccount(account),
    scheme: mapScheme(scheme),
    installments,
    payments,
    ledger,
    redemptions,
    audit: audit.map(mapAudit),
  }
}

function resolveConfiguredRate(db: Database.Database, purity: string): number {
  const rates = getLatestMetalRates(db)
  if (!rates) {
    throw new Error('No gold rate is configured. Set today\'s rate before collecting.')
  }
  const rate = rateForPurity(rates, purity)
  if (rate <= 0) {
    throw new Error('Configured gold rate must be greater than zero')
  }
  return rate
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
    remarks?: string
    idempotencyKey?: string
    createdBy: number | null
    isAdmin: boolean
  },
): number {
  if (input.idempotencyKey) {
    const existing = db
      .prepare('SELECT id FROM gold_saving_payments WHERE idempotency_key = ?')
      .get(input.idempotencyKey) as { id: number } | undefined
    if (existing) return existing.id
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

  const configuredRate = resolveConfiguredRate(db, account.purity)
  let goldRate = configuredRate
  let goldRateSource = 'configured'
  let overrideBy: number | null = null
  const overrideReason = input.goldRateOverrideReason?.trim() ?? ''
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
  }

  const lateFee = input.lateFee ?? 0
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
        payment_mode, transaction_ref, remarks, status, idempotency_key, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)`,
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
        `SELECT COUNT(*) AS count FROM gold_saving_installments WHERE account_id = ? AND status = 'paid'`,
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
      postInitial(db, accountId, first.id, input.initialPayment, user)
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
    remarks: payment.remarks,
    idempotencyKey: payment.idempotencyKey,
    createdBy: user.id,
    isAdmin: user.isAdmin,
  })
}

export function cancelAccount(
  db: Database.Database,
  id: number,
  reason: string,
  userId: number,
): GoldSavingAccountDetail {
  const tx = db.transaction(() => {
    const account = loadAccount(db, id)
    if (account.status === 'cancelled' || account.status === 'closed' || account.status === 'redeemed') {
      throw new Error('This scheme account is already closed')
    }
    db.prepare(
      `UPDATE gold_saving_accounts SET status = 'cancelled', closed_at = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(localTodayIso(), id)
    writeAudit(db, {
      entityType: 'account',
      entityId: id,
      action: 'cancel',
      changedBy: userId,
      before: { status: account.status },
      after: { status: 'cancelled', reason },
    })
  })
  tx()
  return getAccountDetail(db, id)
}

