import type Database from 'better-sqlite3'
import { addCalendarMonths } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type { GoldSavingAccountDetail, GoldSavingPaymentMode, GoldSavingScheme } from '@shared/types'
import { cancelAccount, enrollAccount } from '../goldSavings/accountService'
import { collectPayment } from '../goldSavings/collectionService'
import { createScheme } from '../goldSavings/schemeService'

const MONTHLY_SCHEME_NAME = 'Monthly Gold 2000'
const BONUS_SCHEME_NAME = 'Bonus Gold 2 months'
const MONTHLY_AMOUNT = 2000

const GS_SAMPLE_CUSTOMERS = [
  { name: 'Ravi Kumar', phone: '9876500001', address: 'Salem Main Road' },
  { name: 'Priya', phone: '9876500002', address: 'Attur' },
  { name: 'Suresh', phone: '9876500003', address: 'Salem' },
  { name: 'Meena', phone: '9876500004', address: 'Mettur' },
  { name: 'Kumar', phone: '9876500005', address: 'Namakkal' },
] as const

function accountsEmpty(database: Database.Database): boolean {
  const row = database.prepare('SELECT COUNT(*) AS count FROM gold_saving_accounts').get() as {
    count: number
  }
  return row.count === 0
}

function adminUser(database: Database.Database): { id: number; isAdmin: boolean } {
  const row = database
    .prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`)
    .get() as { id: number } | undefined
  if (!row) {
    throw new Error('Gold savings sample seed requires an admin user')
  }
  return { id: row.id, isAdmin: true }
}

function ensureMetalRates(database: Database.Database, today: string): void {
  const existing = database.prepare('SELECT id FROM metal_rates LIMIT 1').get() as { id: number } | undefined
  if (existing) return
  database
    .prepare(
      `INSERT INTO metal_rates (
         effective_date, gold_22k, gold_24k, gold_20k, gold_18k, silver_fine, silver_925, created_at
       )
       VALUES (?, 10000, 11000, 9000, 8000, 100, 90, datetime('now'))`,
    )
    .run(today)
}

function ensureCustomers(database: Database.Database): Map<string, number> {
  const byName = new Map<string, number>()
  const selectPhone = database.prepare('SELECT id FROM customers WHERE phone = ?')
  const selectName = database.prepare('SELECT id FROM customers WHERE name = ?')
  const insert = database.prepare(
    `INSERT INTO customers (name, phone, address, notes, created_at)
     VALUES (?, ?, ?, '', datetime('now'))`,
  )

  for (const customer of GS_SAMPLE_CUSTOMERS) {
    const byPhone = selectPhone.get(customer.phone) as { id: number } | undefined
    const byExistingName = selectName.get(customer.name) as { id: number } | undefined
    const existing = byPhone ?? byExistingName
    if (existing) {
      byName.set(customer.name, existing.id)
      continue
    }
    const result = insert.run(customer.name, customer.phone, customer.address)
    byName.set(customer.name, Number(result.lastInsertRowid))
  }
  return byName
}

function payNext(
  database: Database.Database,
  accountId: number,
  count: number,
  user: { id: number; isAdmin: boolean },
  mode: GoldSavingPaymentMode,
): void {
  const unpaid = database
    .prepare(
      `SELECT id, due_date, amount FROM gold_saving_installments
       WHERE account_id = ? AND status NOT IN ('paid', 'waived')
       ORDER BY installment_no
       LIMIT ?`,
    )
    .all(accountId, count) as { id: number; due_date: string; amount: number }[]
  for (const row of unpaid) {
    collectPayment(
      database,
      {
        accountId,
        installmentId: row.id,
        paymentDate: row.due_date,
        amount: row.amount,
        paymentMode: mode,
        acceptRateDate: true,
      },
      user,
    )
  }
}

function enroll(
  database: Database.Database,
  input: {
    customerId: number
    schemeId: number
    enrollmentDate: string
    firstInstallmentDate: string
    paymentMode: GoldSavingPaymentMode
  },
  user: { id: number; isAdmin: boolean },
): GoldSavingAccountDetail {
  return enrollAccount(
    database,
    {
      customerId: input.customerId,
      schemeId: input.schemeId,
      enrollmentDate: input.enrollmentDate,
      firstInstallmentDate: input.firstInstallmentDate,
      termsAccepted: true,
      acceptRateDate: true,
      initialPayment: {
        amount: MONTHLY_AMOUNT,
        paymentDate: input.firstInstallmentDate,
        paymentMode: input.paymentMode,
        acceptRateDate: true,
      },
    },
    user,
  )
}

export function countSeededGoldSavingAccounts(database: Database.Database): number {
  return (database.prepare('SELECT COUNT(*) AS count FROM gold_saving_accounts').get() as { count: number }).count
}

export function countSeededGoldSavingSchemes(database: Database.Database): number {
  return (database.prepare('SELECT COUNT(*) AS count FROM gold_saving_schemes').get() as { count: number }).count
}

/** Inserts two schemes and five demo accounts. Skips if any gold-saving accounts already exist. */
export function seedSampleGoldSavingsIfEmpty(database: Database.Database): boolean {
  if (!accountsEmpty(database)) {
    return false
  }

  const today = localTodayIso()
  const fourMonthsAgo = addCalendarMonths(today, -4)
  const oneMonthAgo = addCalendarMonths(today, -1)
  const user = adminUser(database)
  ensureMetalRates(database, today)
  const customers = ensureCustomers(database)

  const monthly: GoldSavingScheme = createScheme(
    database,
    {
      name: MONTHLY_SCHEME_NAME,
      description: 'Sample 11-month gold savings scheme',
      monthlyAmount: MONTHLY_AMOUNT,
      durationMonths: 11,
      purity: '22K',
      goldRateSource: 'configured',
      bonusType: 'none',
      redemptionType: 'jewellery',
      allowLatePayments: true,
      gracePeriodDays: 7,
      terms: 'Pay the monthly installment on or before the due date.',
      status: 'active',
    },
    user.id,
  )
  const bonus: GoldSavingScheme = createScheme(
    database,
    {
      name: BONUS_SCHEME_NAME,
      description: 'Sample two-month scheme with configured bonus gold',
      monthlyAmount: MONTHLY_AMOUNT,
      durationMonths: 2,
      purity: '22K',
      goldRateSource: 'configured',
      bonusType: 'additional_gold',
      bonusValue: 0.5,
      bonusEligibility: 'Paid in full',
      redemptionType: 'jewellery',
      allowLatePayments: true,
      terms: 'Bonus gold is credited only when the scheme is fully paid.',
      status: 'active',
    },
    user.id,
  )

  enroll(
    database,
    {
      customerId: customers.get('Ravi Kumar')!,
      schemeId: monthly.id,
      enrollmentDate: today,
      firstInstallmentDate: today,
      paymentMode: 'cash',
    },
    user,
  )

  const priya = enroll(
    database,
    {
      customerId: customers.get('Priya')!,
      schemeId: monthly.id,
      enrollmentDate: fourMonthsAgo,
      firstInstallmentDate: fourMonthsAgo,
      paymentMode: 'upi',
    },
    user,
  )
  payNext(database, priya.account.id, 3, user, 'upi')

  enroll(
    database,
    {
      customerId: customers.get('Suresh')!,
      schemeId: monthly.id,
      enrollmentDate: fourMonthsAgo,
      firstInstallmentDate: fourMonthsAgo,
      paymentMode: 'cash',
    },
    user,
  )

  const meena = enroll(
    database,
    {
      customerId: customers.get('Meena')!,
      schemeId: bonus.id,
      enrollmentDate: oneMonthAgo,
      firstInstallmentDate: oneMonthAgo,
      paymentMode: 'card',
    },
    user,
  )
  payNext(database, meena.account.id, 1, user, 'card')

  const kumar = enroll(
    database,
    {
      customerId: customers.get('Kumar')!,
      schemeId: monthly.id,
      enrollmentDate: today,
      firstInstallmentDate: today,
      paymentMode: 'cash',
    },
    user,
  )
  cancelAccount(database, kumar.account.id, { reason: 'Sample cancelled account' }, user)

  return true
}
