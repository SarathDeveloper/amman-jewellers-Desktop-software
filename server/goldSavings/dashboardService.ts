import type Database from 'better-sqlite3'
import { localTodayIso } from '@shared/localDate'
import type { GoldSavingDashboard } from '@shared/types'
import { ACCOUNT_SELECT, mapAccount, mapPayment, PAYMENT_SELECT, type AccountRow, type PaymentRow } from './rows'

export function getDashboard(db: Database.Database): GoldSavingDashboard {
  const today = localTodayIso()
  const monthStart = `${today.slice(0, 7)}-01`
  const activeSchemes = (
    db.prepare(`SELECT COUNT(*) AS count FROM gold_saving_schemes WHERE status = 'active'`).get() as { count: number }
  ).count
  const enrolledCustomers = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT customer_id) AS count FROM gold_saving_accounts WHERE status IN ('active', 'matured')`,
      )
      .get() as { count: number }
  ).count
  const todayCollections = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM gold_saving_payments WHERE status = 'posted' AND payment_date = ?`,
      )
      .get(today) as { total: number }
  ).total
  const monthCollections = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM gold_saving_payments
         WHERE status = 'posted' AND payment_date >= ? AND payment_date <= ?`,
      )
      .get(monthStart, today) as { total: number }
  ).total
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS amount, COALESCE(SUM(gold_weight), 0) AS gold
       FROM gold_saving_payments WHERE status = 'posted'`,
    )
    .get() as { amount: number; gold: number }
  const upcomingMaturities = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM gold_saving_accounts
         WHERE status IN ('active', 'matured') AND maturity_date >= ? AND maturity_date <= date(?, '+45 days')`,
      )
      .get(today, today) as { count: number }
  ).count
  const overdueInstallments = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM gold_saving_installments i
         JOIN gold_saving_accounts a ON a.id = i.account_id
         WHERE a.status = 'active' AND i.status NOT IN ('paid', 'waived') AND i.due_date < ?`,
      )
      .get(today) as { count: number }
  ).count

  const monthRows = db
    .prepare(
      `SELECT substr(payment_date, 1, 7) AS month_key, COALESCE(SUM(amount), 0) AS amount
       FROM gold_saving_payments
       WHERE status = 'posted' AND payment_date >= date(?, '-11 months', 'start of month')
       GROUP BY month_key
       ORDER BY month_key`,
    )
    .all(today) as { month_key: string; amount: number }[]
  const monthlyChart = monthRows.map((row) => ({
    key: row.month_key,
    label: formatMonthLabel(row.month_key),
    amount: row.amount,
  }))

  const schemeEnrollments = db
    .prepare(
      `SELECT s.name AS schemeName, COUNT(a.id) AS count
       FROM gold_saving_schemes s
       LEFT JOIN gold_saving_accounts a ON a.scheme_id = s.id
       GROUP BY s.id
       ORDER BY count DESC, s.name`,
    )
    .all() as { schemeName: string; count: number }[]

  const upcomingDues = (
    db
      .prepare(
        `${ACCOUNT_SELECT}
         WHERE a.status = 'active'
           AND EXISTS (
             SELECT 1 FROM gold_saving_installments i
             WHERE i.account_id = a.id AND i.status NOT IN ('paid', 'waived') AND i.due_date <= date(?, '+7 days')
           )
         ORDER BY next_due_date ASC
         LIMIT 8`,
      )
      .all(today) as AccountRow[]
  ).map(mapAccount)

  const recentCollections = (
    db.prepare(`${PAYMENT_SELECT} WHERE p.status = 'posted' ORDER BY p.id DESC LIMIT 8`).all() as PaymentRow[]
  ).map((row) => mapPayment(row, { paid: row.amount, gold: row.gold_weight }))

  const recentEnrollments = (
    db.prepare(`${ACCOUNT_SELECT} ORDER BY a.id DESC LIMIT 8`).all() as AccountRow[]
  ).map(mapAccount)

  const maturingAccounts = (
    db
      .prepare(
        `${ACCOUNT_SELECT}
         WHERE a.status IN ('active', 'matured')
           AND a.maturity_date >= ? AND a.maturity_date <= date(?, '+45 days')
         ORDER BY a.maturity_date ASC
         LIMIT 8`,
      )
      .all(today, today) as AccountRow[]
  ).map(mapAccount)

  return {
    activeSchemes,
    enrolledCustomers,
    todayCollections,
    monthCollections,
    totalCollected: totals.amount,
    totalGold: totals.gold,
    upcomingMaturities,
    overdueInstallments,
    monthlyChart,
    schemeEnrollments,
    upcomingDues,
    recentCollections,
    recentEnrollments,
    maturingAccounts,
  }
}

function formatMonthLabel(key: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [, month] = key.split('-')
  const index = Number(month) - 1
  return months[index] ?? key
}
