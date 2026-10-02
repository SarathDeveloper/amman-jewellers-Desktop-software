import type Database from 'better-sqlite3'
import { roundGoldGrams, roundMoney } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type {
  GoldSavingAgingBucket,
  GoldSavingDashboard,
  GoldSavingMaturityPipelineBucket,
} from '@shared/types'
import { ACCOUNT_SELECT, mapAccount, mapPayment, PAYMENT_SELECT, type AccountRow, type PaymentRow } from './rows'

const OVERDUE_BUCKETS = ['1-7 days', '8-15 days', '16-30 days', '30+ days'] as const
const PIPELINE_BUCKETS = ['This month', 'Next month', '2-3 months', '3-6 months'] as const

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
  const monthTarget = (
    db
      .prepare(
        `SELECT COALESCE(SUM(i.amount), 0) AS total
         FROM gold_saving_installments i
         JOIN gold_saving_accounts a ON a.id = i.account_id
         WHERE a.status IN ('active', 'matured')
           AND i.status != 'waived'
           AND i.due_date >= ? AND i.due_date <= date(?, 'start of month', '+1 month', '-1 day')`,
      )
      .get(monthStart, today) as { total: number }
  ).total
  const overdueAging = bucketOverdueAging(db, today)
  const maturityPipeline = bucketMaturityPipeline(db, today)

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
    monthTarget,
    totalCollected: totals.amount,
    totalGold: totals.gold,
    upcomingMaturities,
    overdueInstallments,
    overdueAging,
    maturityPipeline,
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

function overdueBucketIndex(days: number): number {
  if (days <= 7) return 0
  if (days <= 15) return 1
  if (days <= 30) return 2
  return 3
}

function bucketOverdueAging(db: Database.Database, today: string): GoldSavingAgingBucket[] {
  const buckets: GoldSavingAgingBucket[] = OVERDUE_BUCKETS.map((bucket) => ({
    bucket,
    count: 0,
    amount: 0,
  }))
  const rows = db
    .prepare(
      `SELECT CAST(julianday(?) - julianday(i.due_date) AS INTEGER) AS days, i.amount AS amount
       FROM gold_saving_installments i
       JOIN gold_saving_accounts a ON a.id = i.account_id
       WHERE a.status = 'active' AND i.status NOT IN ('paid', 'waived') AND i.due_date < ?`,
    )
    .all(today, today) as { days: number; amount: number }[]
  for (const row of rows) {
    const bucket = buckets[overdueBucketIndex(row.days)]
    if (!bucket) continue
    bucket.count += 1
    bucket.amount += row.amount
  }
  return buckets.map((bucket) => ({ ...bucket, amount: roundMoney(bucket.amount) }))
}

function calendarMonthOffset(fromIso: string, toIso: string): number {
  const [fromYear, fromMonth] = fromIso.split('-').map(Number)
  const [toYear, toMonth] = toIso.split('-').map(Number)
  return (toYear - fromYear) * 12 + (toMonth - fromMonth)
}

function pipelineBucketIndex(offset: number): number | null {
  if (offset === 0) return 0
  if (offset === 1) return 1
  if (offset === 2 || offset === 3) return 2
  if (offset >= 4 && offset <= 6) return 3
  return null
}

function bucketMaturityPipeline(db: Database.Database, today: string): GoldSavingMaturityPipelineBucket[] {
  const buckets: GoldSavingMaturityPipelineBucket[] = PIPELINE_BUCKETS.map((bucket) => ({
    bucket,
    count: 0,
    gold: 0,
  }))
  const rows = db
    .prepare(
      `SELECT a.maturity_date AS maturityDate,
              COALESCE(
                (SELECT l.cumulative_gold FROM gold_saving_ledger l WHERE l.account_id = a.id ORDER BY l.id DESC LIMIT 1),
                0
              ) AS gold
       FROM gold_saving_accounts a
       WHERE a.status IN ('active', 'matured')
         AND a.maturity_date >= ?
         AND a.maturity_date < date(?, 'start of month', '+7 months')`,
    )
    .all(today, today) as { maturityDate: string; gold: number }[]
  for (const row of rows) {
    const index = pipelineBucketIndex(calendarMonthOffset(today, row.maturityDate))
    if (index == null) continue
    const bucket = buckets[index]
    if (!bucket) continue
    bucket.count += 1
    bucket.gold += row.gold
  }
  return buckets.map((bucket) => ({ ...bucket, gold: roundGoldGrams(bucket.gold) }))
}
