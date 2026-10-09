import type Database from 'better-sqlite3'
import { localTodayIso } from '@shared/localDate'
import type { GoldSavingReportId, GoldSavingReportResult } from '@shared/types'
import { ACCOUNT_SELECT, mapAccount, type AccountRow } from './rows'

const TITLES: Record<GoldSavingReportId, string> = {
  'daily-collections': 'Daily Collections',
  'monthly-collections': 'Monthly Collections',
  'customer-ledger': 'Customer-wise Scheme Ledger',
  'scheme-performance': 'Scheme-wise Performance',
  'active-schemes': 'Active Schemes',
  'matured-schemes': 'Matured Schemes',
  'overdue-installments': 'Overdue Installments',
  'overdue-aging': 'Overdue Aging',
  'cancelled-schemes': 'Cancelled Schemes',
  'gold-accumulation': 'Gold Weight Accumulation',
  'redemption-history': 'Redemption History',
  'outstanding-obligations': 'Outstanding Scheme Obligations',
}

export function runGoldSavingReport(
  db: Database.Database,
  id: GoldSavingReportId,
  query: { from?: string; to?: string; schemeId?: number; q?: string; customerId?: number } = {},
): GoldSavingReportResult {
  const today = localTodayIso()
  const from = query.from
  const to = query.to
  const generatedAt = new Date().toISOString()

  if (id === 'daily-collections') {
    const rows = db
      .prepare(
        `SELECT p.payment_date AS date, p.receipt_no AS receipt, a.account_no AS account,
                c.name AS customer, p.amount AS amount, p.gold_rate AS rate, p.gold_weight AS gold, p.payment_mode AS mode
         FROM gold_saving_payments p
         JOIN gold_saving_accounts a ON a.id = p.account_id
         JOIN customers c ON c.id = a.customer_id
         WHERE p.status = 'posted'
           AND (? IS NULL OR p.payment_date >= ?)
           AND (? IS NULL OR p.payment_date <= ?)
           AND (? IS NULL OR a.scheme_id = ?)
         ORDER BY p.payment_date DESC, p.id DESC`,
      )
      .all(from ?? null, from ?? null, to ?? null, to ?? null, query.schemeId ?? null, query.schemeId ?? null) as Array<
      Record<string, string | number>
    >
    return pack(id, ['Date', 'Receipt', 'Account', 'Customer', 'Amount', 'Rate', 'Gold', 'Mode'], rows, generatedAt)
  }

  if (id === 'monthly-collections') {
    const rows = db
      .prepare(
        `SELECT substr(p.payment_date, 1, 7) AS month, COUNT(*) AS payments,
                COALESCE(SUM(p.amount), 0) AS amount, COALESCE(SUM(p.gold_weight), 0) AS gold
         FROM gold_saving_payments p
         JOIN gold_saving_accounts a ON a.id = p.account_id
         WHERE p.status = 'posted'
           AND (? IS NULL OR p.payment_date >= ?)
           AND (? IS NULL OR p.payment_date <= ?)
           AND (? IS NULL OR a.scheme_id = ?)
         GROUP BY month
         ORDER BY month DESC`,
      )
      .all(from ?? null, from ?? null, to ?? null, to ?? null, query.schemeId ?? null, query.schemeId ?? null) as Array<
      Record<string, string | number>
    >
    return pack(id, ['Month', 'Payments', 'Amount', 'Gold'], rows, generatedAt)
  }

  if (id === 'customer-ledger') {
    const rows = db
      .prepare(
        `SELECT a.account_no AS account, c.name AS customer, l.entry_date AS date, l.entry_type AS type,
                l.txn_ref AS reference, l.amount AS amount, l.gold_rate AS rate, l.gold_weight AS gold, l.cumulative_gold AS balance
         FROM gold_saving_ledger l
         JOIN gold_saving_accounts a ON a.id = l.account_id
         JOIN customers c ON c.id = a.customer_id
         WHERE (? IS NULL OR l.entry_date >= ?)
           AND (? IS NULL OR l.entry_date <= ?)
           AND (? IS NULL OR a.scheme_id = ?)
           AND (? IS NULL OR a.customer_id = ?)
           AND (? IS NULL OR a.account_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)
         ORDER BY c.name, l.id`,
      )
      .all(
        from ?? null,
        from ?? null,
        to ?? null,
        to ?? null,
        query.schemeId ?? null,
        query.schemeId ?? null,
        query.customerId ?? null,
        query.customerId ?? null,
        query.q ? `%${query.q}%` : null,
        query.q ? `%${query.q}%` : '',
        query.q ? `%${query.q}%` : '',
        query.q ? `%${query.q}%` : '',
      ) as Array<Record<string, string | number>>
    return pack(
      id,
      ['Account', 'Customer', 'Date', 'Type', 'Reference', 'Amount', 'Rate', 'Gold', 'Balance'],
      rows,
      generatedAt,
    )
  }

  if (id === 'scheme-performance') {
    const rows = db
      .prepare(
        `SELECT s.name AS scheme, COUNT(DISTINCT a.id) AS accounts,
                COALESCE(SUM(CASE WHEN p.status = 'posted' THEN p.amount END), 0) AS collected,
                COALESCE(SUM(CASE WHEN p.status = 'posted' THEN p.gold_weight END), 0) AS gold
         FROM gold_saving_schemes s
         LEFT JOIN gold_saving_accounts a ON a.scheme_id = s.id
         LEFT JOIN gold_saving_payments p ON p.account_id = a.id
         GROUP BY s.id
         ORDER BY s.name`,
      )
      .all() as Array<Record<string, string | number>>
    return pack(id, ['Scheme', 'Accounts', 'Collected', 'Gold'], rows, generatedAt)
  }

  if (id === 'active-schemes' || id === 'matured-schemes' || id === 'cancelled-schemes') {
    if (id === 'cancelled-schemes') {
      const rows = db
        .prepare(
          `SELECT a.account_no AS account, c.name AS customer, s.name AS scheme,
                  a.enrollment_date AS enrolled, a.maturity_date AS maturity,
                  COALESCE((SELECT SUM(p.amount) FROM gold_saving_payments p
                            WHERE p.account_id = a.id AND p.status = 'posted'), 0) AS paid,
                  COALESCE(rf.gold_forfeited, 0) AS gold,
                  COALESCE(rf.voucher_no, '') AS voucher,
                  COALESCE(rf.deduction, 0) AS deduction,
                  COALESCE(rf.refund_amount, 0) AS refund,
                  a.status AS status
           FROM gold_saving_accounts a
           JOIN customers c ON c.id = a.customer_id
           JOIN gold_saving_schemes s ON s.id = a.scheme_id
           LEFT JOIN gold_saving_refunds rf ON rf.account_id = a.id
           WHERE a.status = 'cancelled'
           ORDER BY a.created_at DESC`,
        )
        .all() as Array<Record<string, string | number>>
      return pack(
        id,
        ['Account', 'Customer', 'Scheme', 'Enrolled', 'Maturity', 'Paid', 'Gold', 'Voucher', 'Deduction', 'Refund', 'Status'],
        rows,
        generatedAt,
      )
    }
    const status = id === 'active-schemes' ? 'active' : 'matured'
    const accounts = (
      db.prepare(`${ACCOUNT_SELECT} WHERE a.status = ? ORDER BY a.created_at DESC`).all(status) as AccountRow[]
    ).map(mapAccount)
    const rows = accounts.map((account) => ({
      account: account.accountNo,
      customer: account.customerName,
      scheme: account.schemeName,
      enrolled: account.enrollmentDate,
      maturity: account.maturityDate,
      paid: account.totalPaid,
      gold: account.goldAccumulated,
      status: account.status,
    }))
    return pack(
      id,
      ['Account', 'Customer', 'Scheme', 'Enrolled', 'Maturity', 'Paid', 'Gold', 'Status'],
      rows,
      generatedAt,
    )
  }

  if (id === 'overdue-installments') {
    const rows = db
      .prepare(
        `SELECT a.account_no AS account, c.name AS customer, s.name AS scheme, i.installment_no AS installment,
                i.due_date AS due, i.amount AS amount, a.monthly_amount AS monthly
         FROM gold_saving_installments i
         JOIN gold_saving_accounts a ON a.id = i.account_id
         JOIN customers c ON c.id = a.customer_id
         JOIN gold_saving_schemes s ON s.id = a.scheme_id
         WHERE a.status = 'active' AND i.status NOT IN ('paid', 'waived') AND i.due_date < ?
         ORDER BY i.due_date, a.account_no`,
      )
      .all(today) as Array<Record<string, string | number>>
    return pack(id, ['Account', 'Customer', 'Scheme', 'Installment', 'Due', 'Amount', 'Monthly'], rows, generatedAt)
  }

  if (id === 'overdue-aging') {
    const raw = db
      .prepare(
        `SELECT a.account_no AS account, c.name AS customer, c.phone AS mobile, s.name AS scheme,
                i.installment_no AS installment,
                i.due_date AS due, i.amount AS amount,
                CAST(julianday(?) - julianday(i.due_date) AS INTEGER) AS days,
                CASE
                  WHEN CAST(julianday(?) - julianday(i.due_date) AS INTEGER) <= 7 THEN '1-7 days'
                  WHEN CAST(julianday(?) - julianday(i.due_date) AS INTEGER) <= 15 THEN '8-15 days'
                  WHEN CAST(julianday(?) - julianday(i.due_date) AS INTEGER) <= 30 THEN '16-30 days'
                  ELSE '30+ days'
                END AS bucket,
                (SELECT COUNT(*) FROM gold_saving_installments oi
                 WHERE oi.account_id = a.id AND oi.status NOT IN ('paid', 'waived') AND oi.due_date < ?) AS overdue_count
         FROM gold_saving_installments i
         JOIN gold_saving_accounts a ON a.id = i.account_id
         JOIN customers c ON c.id = a.customer_id
         JOIN gold_saving_schemes s ON s.id = a.scheme_id
         WHERE a.status = 'active' AND i.status NOT IN ('paid', 'waived') AND i.due_date < ?
           AND (? IS NULL OR a.scheme_id = ?)
           AND (? IS NULL OR a.account_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)
         ORDER BY days DESC, a.account_no, i.installment_no`,
      )
      .all(
        today,
        today,
        today,
        today,
        today,
        today,
        query.schemeId ?? null,
        query.schemeId ?? null,
        query.q ? `%${query.q}%` : null,
        query.q ? `%${query.q}%` : '',
        query.q ? `%${query.q}%` : '',
        query.q ? `%${query.q}%` : '',
      ) as Array<{
        account: string
        customer: string
        mobile: string
        scheme: string
        installment: number
        due: string
        amount: number
        days: number
        bucket: string
        overdue_count: number
      }>
    const rows = raw.map((row) => ({
      account: row.account,
      customer: row.customer,
      mobile: row.mobile,
      scheme: row.scheme,
      installment: row.installment,
      due: row.due,
      'days overdue': row.days,
      amount: row.amount,
      'overdue count': row.overdue_count,
      bucket: row.bucket,
    }))
    return pack(
      id,
      [
        'Account',
        'Customer',
        'Mobile',
        'Scheme',
        'Installment',
        'Due',
        'Days overdue',
        'Amount',
        'Overdue count',
        'Bucket',
      ],
      rows,
      generatedAt,
    )
  }

  if (id === 'gold-accumulation') {
    const rows = db
      .prepare(
        `SELECT a.account_no AS account, c.name AS customer, s.name AS scheme, a.purity AS purity,
                COALESCE((SELECT SUM(p.amount) FROM gold_saving_payments p WHERE p.account_id = a.id AND p.status = 'posted'), 0) AS paid,
                COALESCE((SELECT l.cumulative_gold FROM gold_saving_ledger l WHERE l.account_id = a.id ORDER BY l.id DESC LIMIT 1), 0) AS gold
         FROM gold_saving_accounts a
         JOIN customers c ON c.id = a.customer_id
         JOIN gold_saving_schemes s ON s.id = a.scheme_id
         WHERE a.status IN ('active', 'matured')
         ORDER BY gold DESC`,
      )
      .all() as Array<Record<string, string | number>>
    return pack(id, ['Account', 'Customer', 'Scheme', 'Purity', 'Paid', 'Gold'], rows, generatedAt)
  }

  if (id === 'redemption-history') {
    const rows = db
      .prepare(
        `SELECT r.redemption_date AS date, r.receipt_no AS receipt, a.account_no AS account, c.name AS customer,
                r.redemption_kind AS kind, r.gold_weight AS gold, r.bonus_gold_weight AS bonus, r.remaining_gold AS remaining
         FROM gold_saving_redemptions r
         JOIN gold_saving_accounts a ON a.id = r.account_id
         JOIN customers c ON c.id = a.customer_id
         WHERE (? IS NULL OR r.redemption_date >= ?)
           AND (? IS NULL OR r.redemption_date <= ?)
         ORDER BY r.id DESC`,
      )
      .all(from ?? null, from ?? null, to ?? null, to ?? null) as Array<Record<string, string | number>>
    return pack(id, ['Date', 'Receipt', 'Account', 'Customer', 'Kind', 'Gold', 'Bonus', 'Remaining'], rows, generatedAt)
  }

  const rows = db
    .prepare(
      `SELECT a.account_no AS account, c.name AS customer, s.name AS scheme,
              (a.duration_months - (
                SELECT COUNT(*) FROM gold_saving_installments i WHERE i.account_id = a.id AND i.status = 'paid'
              )) AS pending,
              COALESCE((SELECT l.cumulative_gold FROM gold_saving_ledger l WHERE l.account_id = a.id ORDER BY l.id DESC LIMIT 1), 0) AS gold,
              a.maturity_date AS maturity
       FROM gold_saving_accounts a
       JOIN customers c ON c.id = a.customer_id
       JOIN gold_saving_schemes s ON s.id = a.scheme_id
       WHERE a.status IN ('active', 'matured')
       ORDER BY a.maturity_date`,
    )
    .all() as Array<Record<string, string | number>>
  return pack(id, ['Account', 'Customer', 'Scheme', 'Pending', 'Gold', 'Maturity'], rows, generatedAt)
}

function pack(
  id: GoldSavingReportId,
  columns: string[],
  rows: Array<Record<string, string | number>>,
  generatedAt: string,
): GoldSavingReportResult {
  const normalized = rows.map((row) => {
    const next: Record<string, string | number> = {}
    for (const column of columns) {
      const fromTitle = row[column]
      const fromAlias = row[column.toLowerCase()]
      next[column] = fromTitle ?? fromAlias ?? ''
    }
    return next
  })
  return { id, title: TITLES[id], generatedAt, columns, rows: normalized }
}
