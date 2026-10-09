import type Database from 'better-sqlite3'
import { roundGoldGrams, roundMoney } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type {
  GoldSavingAccount,
  GoldSavingAccountStatus,
  GoldSavingAuditLog,
  GoldSavingBonusType,
  GoldSavingCancelDeductionType,
  GoldSavingGoldRateSource,
  GoldSavingInstallment,
  GoldSavingInstallmentStatus,
  GoldSavingLateFeeType,
  GoldSavingLedgerEntry,
  GoldSavingLedgerType,
  GoldSavingPayment,
  GoldSavingPaymentMode,
  GoldSavingPaymentStatus,
  GoldSavingRedemption,
  GoldSavingRedemptionKind,
  GoldSavingRedemptionType,
  GoldSavingRefund,
  GoldSavingScheme,
  GoldSavingSchemeStatus,
} from '@shared/types'

export type SchemeRow = {
  id: number
  name: string
  code: string
  description: string
  monthly_amount: number
  duration_months: number
  min_installment: number | null
  max_installment: number | null
  purity: string
  gold_rate_source: GoldSavingGoldRateSource
  gold_rate_unit: string
  bonus_type: GoldSavingBonusType
  bonus_value: number
  bonus_eligibility: string
  allow_late_payments: number
  grace_period_days: number
  allow_missed_installments: number
  allow_early_closure: number
  allow_partial_redemption: number
  allow_multiple_accounts: number
  redemption_type: GoldSavingRedemptionType
  making_charge_rules: string
  wastage_rules: string
  available_from: string | null
  available_to: string | null
  terms: string
  status: GoldSavingSchemeStatus
  cancel_deduction_type: GoldSavingCancelDeductionType
  cancel_deduction_value: number
  late_fee_type: GoldSavingLateFeeType
  late_fee_value: number
  created_at: string
  updated_at: string
}

export type AccountRow = {
  id: number
  account_no: string
  customer_id: number
  scheme_id: number
  monthly_amount: number
  duration_months: number
  purity: string
  enrollment_date: string
  first_installment_date: string
  maturity_date: string
  preferred_payment_day: number | null
  nominee_name: string
  nominee_relationship: string
  nominee_phone: string
  terms_accepted: number
  status: GoldSavingAccountStatus
  closed_at: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  customer_name: string
  customer_phone: string
  customer_address: string
  scheme_name: string
  scheme_code: string
  paid_installments: number
  total_paid: number
  gold_accumulated: number
  next_due_date: string | null
}

export type InstallmentRow = {
  id: number
  account_id: number
  installment_no: number
  due_date: string
  amount: number
  status: GoldSavingInstallmentStatus
  paid_at: string | null
}

export type PaymentRow = {
  id: number
  account_id: number
  installment_id: number | null
  receipt_no: string
  installment_no: number
  payment_date: string
  due_date: string
  amount: number
  late_fee: number
  discount: number
  total_received: number
  gold_rate: number
  gold_weight: number
  gold_rate_source: string
  gold_rate_override_reason: string
  gold_rate_override_by: number | null
  purity: string
  payment_mode: GoldSavingPaymentMode
  transaction_ref: string
  remarks: string
  status: GoldSavingPaymentStatus
  reversed_payment_id: number | null
  idempotency_key: string | null
  batch_no: string | null
  created_by: number | null
  created_at: string
  account_no: string
  duration_months: number
  customer_id: number
  customer_name: string
  customer_phone: string
  scheme_name: string
}

export type LedgerRow = {
  id: number
  account_id: number
  entry_date: string
  entry_type: GoldSavingLedgerType
  payment_id: number | null
  redemption_id: number | null
  amount: number
  gold_weight: number
  gold_rate: number
  cumulative_gold: number
  txn_ref: string
  notes: string
  created_by: number | null
  created_at: string
  receipt_no: string | null
  installment_no: number | null
  payment_mode: string | null
  payment_status: string | null
}

export type RedemptionRow = {
  id: number
  account_id: number
  receipt_no: string
  redemption_date: string
  redemption_kind: GoldSavingRedemptionKind
  gold_weight: number
  bonus_gold_weight: number
  invoice_id: number | null
  making_charges: number
  wastage: number
  taxes: number
  invoice_value: number
  remaining_gold: number
  closes_account: number
  notes: string
  created_by: number | null
  created_at: string
  account_no: string
  customer_name: string
  invoice_no: string | null
}

export type AuditRow = {
  id: number
  entity_type: string
  entity_id: number
  action: string
  changed_by: number | null
  before_json: string
  after_json: string
  created_at: string
}

export type RefundRow = {
  id: number
  account_id: number
  voucher_no: string
  refund_date: string
  total_paid: number
  deduction: number
  refund_amount: number
  payment_mode: GoldSavingPaymentMode
  transaction_ref: string
  gold_forfeited: number
  reason: string
  created_by: number | null
  created_at: string
  account_no: string
  customer_id: number
  customer_name: string
  customer_phone: string
  scheme_name: string
  duration_months: number
}

export function asBool(value: number): boolean {
  return value === 1
}

export function mapScheme(row: SchemeRow): GoldSavingScheme {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    monthlyAmount: row.monthly_amount,
    durationMonths: row.duration_months,
    minInstallment: row.min_installment,
    maxInstallment: row.max_installment,
    purity: row.purity,
    goldRateSource: row.gold_rate_source,
    goldRateUnit: row.gold_rate_unit,
    bonusType: row.bonus_type,
    bonusValue: row.bonus_value,
    bonusEligibility: row.bonus_eligibility,
    allowLatePayments: asBool(row.allow_late_payments),
    gracePeriodDays: row.grace_period_days,
    allowMissedInstallments: asBool(row.allow_missed_installments),
    allowEarlyClosure: asBool(row.allow_early_closure),
    allowPartialRedemption: asBool(row.allow_partial_redemption),
    allowMultipleAccounts: asBool(row.allow_multiple_accounts),
    redemptionType: row.redemption_type,
    makingChargeRules: row.making_charge_rules,
    wastageRules: row.wastage_rules,
    availableFrom: row.available_from,
    availableTo: row.available_to,
    terms: row.terms,
    status: row.status,
    cancelDeductionType: row.cancel_deduction_type ?? 'none',
    cancelDeductionValue: row.cancel_deduction_value ?? 0,
    lateFeeType: row.late_fee_type ?? 'none',
    lateFeeValue: row.late_fee_value ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function liveInstallmentStatus(
  row: InstallmentRow,
  today: string,
): GoldSavingInstallmentStatus {
  if (row.status === 'paid' || row.status === 'waived') return row.status
  if (row.due_date < today) return 'overdue'
  if (row.due_date === today) return 'due'
  return row.status === 'due' ? 'due' : 'upcoming'
}

export function mapInstallment(row: InstallmentRow, today = localTodayIso()): GoldSavingInstallment {
  return {
    id: row.id,
    accountId: row.account_id,
    installmentNo: row.installment_no,
    dueDate: row.due_date,
    amount: row.amount,
    status: liveInstallmentStatus(row, today),
    paidAt: row.paid_at,
  }
}

export function mapAccount(row: AccountRow): GoldSavingAccount {
  const pending = Math.max(0, row.duration_months - row.paid_installments)
  return {
    id: row.id,
    accountNo: row.account_no,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    schemeId: row.scheme_id,
    schemeName: row.scheme_name,
    schemeCode: row.scheme_code,
    monthlyAmount: row.monthly_amount,
    durationMonths: row.duration_months,
    purity: row.purity,
    enrollmentDate: row.enrollment_date,
    firstInstallmentDate: row.first_installment_date,
    maturityDate: row.maturity_date,
    preferredPaymentDay: row.preferred_payment_day,
    nomineeName: row.nominee_name,
    nomineeRelationship: row.nominee_relationship,
    nomineePhone: row.nominee_phone,
    termsAccepted: asBool(row.terms_accepted),
    status: row.status,
    closedAt: row.closed_at,
    paidInstallments: row.paid_installments,
    pendingInstallments: pending,
    totalPaid: row.total_paid,
    goldAccumulated: row.gold_accumulated,
    nextDueDate: row.next_due_date,
    createdAt: row.created_at,
  }
}

export function mapPayment(row: PaymentRow, totals?: { paid: number; gold: number }): GoldSavingPayment {
  return {
    id: row.id,
    accountId: row.account_id,
    accountNo: row.account_no,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    schemeName: row.scheme_name,
    durationMonths: row.duration_months,
    installmentId: row.installment_id,
    receiptNo: row.receipt_no,
    installmentNo: row.installment_no,
    paymentDate: row.payment_date,
    dueDate: row.due_date,
    amount: row.amount,
    lateFee: row.late_fee,
    discount: row.discount,
    totalReceived: row.total_received,
    goldRate: row.gold_rate,
    goldWeight: row.gold_weight,
    goldRateSource: row.gold_rate_source,
    goldRateOverrideReason: row.gold_rate_override_reason,
    purity: row.purity,
    paymentMode: row.payment_mode,
    transactionRef: row.transaction_ref,
    remarks: row.remarks,
    status: row.status,
    batchNo: row.batch_no ?? '',
    createdAt: row.created_at,
    totalPaidToDate: totals?.paid ?? 0,
    goldAccumulatedToDate: totals?.gold ?? 0,
  }
}

export function mapLedger(row: LedgerRow): GoldSavingLedgerEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    entryDate: row.entry_date,
    entryType: row.entry_type,
    paymentId: row.payment_id,
    redemptionId: row.redemption_id,
    receiptNo: row.receipt_no ?? row.txn_ref,
    installmentNo: row.installment_no,
    amount: row.amount,
    goldRate: row.gold_rate,
    goldWeight: row.gold_weight,
    cumulativeGold: row.cumulative_gold,
    paymentMode: row.payment_mode ?? '',
    paymentStatus: row.payment_status ?? row.entry_type,
    txnRef: row.txn_ref,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export function mapRedemption(row: RedemptionRow): GoldSavingRedemption {
  return {
    id: row.id,
    accountId: row.account_id,
    accountNo: row.account_no,
    customerName: row.customer_name,
    receiptNo: row.receipt_no,
    redemptionDate: row.redemption_date,
    redemptionKind: row.redemption_kind,
    goldWeight: row.gold_weight,
    bonusGoldWeight: row.bonus_gold_weight,
    invoiceId: row.invoice_id,
    invoiceNo: row.invoice_no ?? '',
    makingCharges: row.making_charges,
    wastage: row.wastage,
    taxes: row.taxes,
    invoiceValue: row.invoice_value,
    remainingGold: row.remaining_gold,
    closesAccount: asBool(row.closes_account),
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export function mapAudit(row: AuditRow): GoldSavingAuditLog {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    changedBy: row.changed_by,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    createdAt: row.created_at,
  }
}

export function mapRefund(row: RefundRow): GoldSavingRefund {
  return {
    id: row.id,
    accountId: row.account_id,
    accountNo: row.account_no,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    schemeName: row.scheme_name,
    durationMonths: row.duration_months,
    voucherNo: row.voucher_no,
    refundDate: row.refund_date,
    totalPaid: row.total_paid,
    deduction: row.deduction,
    refundAmount: row.refund_amount,
    paymentMode: row.payment_mode,
    transactionRef: row.transaction_ref,
    goldForfeited: row.gold_forfeited,
    reason: row.reason,
    createdAt: row.created_at,
  }
}

export const ACCOUNT_SELECT = `
  SELECT a.*,
    c.name AS customer_name,
    c.phone AS customer_phone,
    c.address AS customer_address,
    s.name AS scheme_name,
    s.code AS scheme_code,
    (
      SELECT COUNT(*) FROM gold_saving_installments i
      WHERE i.account_id = a.id AND i.status = 'paid'
    ) AS paid_installments,
    (
      SELECT COALESCE(SUM(p.amount), 0) FROM gold_saving_payments p
      WHERE p.account_id = a.id AND p.status = 'posted'
    ) AS total_paid,
    (
      SELECT COALESCE(l.cumulative_gold, 0) FROM gold_saving_ledger l
      WHERE l.account_id = a.id ORDER BY l.id DESC LIMIT 1
    ) AS gold_accumulated,
    (
      SELECT MIN(i.due_date) FROM gold_saving_installments i
      WHERE i.account_id = a.id AND i.status NOT IN ('paid', 'waived')
    ) AS next_due_date
  FROM gold_saving_accounts a
  JOIN customers c ON c.id = a.customer_id
  JOIN gold_saving_schemes s ON s.id = a.scheme_id
`

export const PAYMENT_SELECT = `
  SELECT p.*,
    a.account_no,
    a.duration_months,
    c.id AS customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    s.name AS scheme_name
  FROM gold_saving_payments p
  JOIN gold_saving_accounts a ON a.id = p.account_id
  JOIN customers c ON c.id = a.customer_id
  JOIN gold_saving_schemes s ON s.id = a.scheme_id
`

export const LEDGER_SELECT = `
  SELECT l.*,
    p.receipt_no,
    p.installment_no,
    p.payment_mode,
    p.status AS payment_status
  FROM gold_saving_ledger l
  LEFT JOIN gold_saving_payments p ON p.id = l.payment_id
`

export const REDEMPTION_SELECT = `
  SELECT r.*,
    a.account_no,
    c.name AS customer_name,
    inv.invoice_no AS invoice_no
  FROM gold_saving_redemptions r
  JOIN gold_saving_accounts a ON a.id = r.account_id
  JOIN customers c ON c.id = a.customer_id
  LEFT JOIN invoices inv ON inv.id = r.invoice_id
`

export const REFUND_SELECT = `
  SELECT r.*,
    a.account_no,
    a.duration_months,
    c.id AS customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    s.name AS scheme_name
  FROM gold_saving_refunds r
  JOIN gold_saving_accounts a ON a.id = r.account_id
  JOIN customers c ON c.id = a.customer_id
  JOIN gold_saving_schemes s ON s.id = a.scheme_id
`

export function loadScheme(db: Database.Database, id: number): SchemeRow {
  const row = db.prepare('SELECT * FROM gold_saving_schemes WHERE id = ?').get(id) as SchemeRow | undefined
  if (!row) throw new Error('Scheme not found')
  return row
}

export function loadAccount(db: Database.Database, id: number): AccountRow {
  const row = db.prepare(`${ACCOUNT_SELECT} WHERE a.id = ?`).get(id) as AccountRow | undefined
  if (!row) throw new Error('Scheme account not found')
  return row
}

export function loadPayment(db: Database.Database, id: number): PaymentRow {
  const row = db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).get(id) as PaymentRow | undefined
  if (!row) throw new Error('Payment not found')
  return row
}

export function loadRefund(db: Database.Database, id: number): RefundRow {
  const row = db.prepare(`${REFUND_SELECT} WHERE r.id = ?`).get(id) as RefundRow | undefined
  if (!row) throw new Error('Refund not found')
  return row
}

export function writeAudit(
  db: Database.Database,
  input: {
    entityType: string
    entityId: number
    action: string
    changedBy: number | null
    before?: unknown
    after?: unknown
  },
): void {
  db.prepare(
    `INSERT INTO gold_saving_audit_logs (entity_type, entity_id, action, changed_by, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.entityType,
    input.entityId,
    input.action,
    input.changedBy,
    input.before ? JSON.stringify(input.before) : '',
    input.after ? JSON.stringify(input.after) : '',
  )
}

export function nextSchemeCode(db: Database.Database): string {
  const last = db
    .prepare(`SELECT code FROM gold_saving_schemes WHERE code LIKE 'GS-%' ORDER BY id DESC LIMIT 1`)
    .get() as { code: string } | undefined
  const lastSeq = last ? Number.parseInt(last.code.replace('GS-', ''), 10) : 0
  const next = (Number.isNaN(lastSeq) ? 0 : lastSeq) + 1
  return `GS-${String(next).padStart(3, '0')}`
}

export function nextAccountNo(db: Database.Database, enrollmentDate: string): string {
  const yyyymm = enrollmentDate.slice(0, 7).replace('-', '')
  const prefix = `GS-${yyyymm}-`
  const last = db
    .prepare(`SELECT account_no FROM gold_saving_accounts WHERE account_no LIKE ? ORDER BY account_no DESC LIMIT 1`)
    .get(`${prefix}%`) as { account_no: string } | undefined
  const lastSeq = last ? Number.parseInt(last.account_no.replace(prefix, ''), 10) : 0
  const next = (Number.isNaN(lastSeq) ? 0 : lastSeq) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

export function nextBatchNo(db: Database.Database): string {
  const year = new Date().getFullYear()
  const full = `GSB-${year}-`
  const last = db
    .prepare(
      `SELECT batch_no AS no FROM gold_saving_payments
       WHERE batch_no LIKE ? ORDER BY batch_no DESC LIMIT 1`,
    )
    .get(`${full}%`) as { no: string } | undefined
  const lastSeq = last ? Number.parseInt(last.no.replace(full, ''), 10) : 0
  const next = (Number.isNaN(lastSeq) ? 0 : lastSeq) + 1
  return `${full}${String(next).padStart(4, '0')}`
}

export function nextReceiptNo(db: Database.Database, prefix: string): string {
  const year = new Date().getFullYear()
  const full = `${prefix}-${year}-`
  const last = db
    .prepare(
      `SELECT receipt_no AS no FROM gold_saving_payments WHERE receipt_no LIKE ?
       UNION ALL
       SELECT receipt_no AS no FROM gold_saving_redemptions WHERE receipt_no LIKE ?
       UNION ALL
       SELECT voucher_no AS no FROM gold_saving_refunds WHERE voucher_no LIKE ?
       ORDER BY no DESC LIMIT 1`,
    )
    .get(`${full}%`, `${full}%`, `${full}%`) as { no: string } | undefined
  const lastSeq = last ? Number.parseInt(last.no.replace(full, ''), 10) : 0
  const next = (Number.isNaN(lastSeq) ? 0 : lastSeq) + 1
  return `${full}${String(next).padStart(4, '0')}`
}

export function paymentReceiptTotals(db: Database.Database, paymentId: number): { paid: number; gold: number } {
  const payment = db
    .prepare(
      `SELECT account_id, created_at, id, amount, gold_weight FROM gold_saving_payments WHERE id = ?`,
    )
    .get(paymentId) as {
    account_id: number
    created_at: string
    id: number
    amount: number
    gold_weight: number
  }
  const earlier = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS paid, COALESCE(SUM(gold_weight), 0) AS gold
       FROM gold_saving_payments
       WHERE account_id = ? AND status = 'posted' AND (created_at < ? OR (created_at = ? AND id < ?))`,
    )
    .get(payment.account_id, payment.created_at, payment.created_at, payment.id) as {
    paid: number
    gold: number
  }
  return {
    paid: roundMoney(earlier.paid + payment.amount),
    gold: roundGoldGrams(earlier.gold + payment.gold_weight),
  }
}

export function currentGoldBalance(db: Database.Database, accountId: number): number {
  const row = db
    .prepare(
      `SELECT cumulative_gold FROM gold_saving_ledger WHERE account_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(accountId) as { cumulative_gold: number } | undefined
  return row?.cumulative_gold ?? 0
}

export function insertLedger(
  db: Database.Database,
  input: {
    accountId: number
    entryDate: string
    entryType: GoldSavingLedgerType
    paymentId?: number | null
    redemptionId?: number | null
    amount: number
    goldWeight: number
    goldRate: number
    txnRef: string
    notes?: string
    createdBy: number | null
  },
): number {
  const previous = currentGoldBalance(db, input.accountId)
  const cumulative = roundGoldGrams(previous + input.goldWeight)
  const result = db
    .prepare(
      `INSERT INTO gold_saving_ledger (
        account_id, entry_date, entry_type, payment_id, redemption_id,
        amount, gold_weight, gold_rate, cumulative_gold, txn_ref, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.accountId,
      input.entryDate,
      input.entryType,
      input.paymentId ?? null,
      input.redemptionId ?? null,
      input.amount,
      input.goldWeight,
      input.goldRate,
      cumulative,
      input.txnRef,
      input.notes ?? '',
      input.createdBy,
    )
  return Number(result.lastInsertRowid)
}
