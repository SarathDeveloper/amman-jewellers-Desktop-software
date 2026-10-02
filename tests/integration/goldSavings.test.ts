import { describe, expect, it } from 'vitest'
import type { GoldSavingScheme, GoldSavingSchemeInput } from '@shared/types'
import { getDatabase } from '../../server/db'
import { getTestAgent, loginAsAdmin, useIntegrationEnv } from './helpers/testEnv'

const TODAY = '2026-09-30'

type Installment = { id: number; installmentNo: number; status: string }
type LedgerEntry = { entryType: string; goldWeight: number; goldRate: number; cumulativeGold: number }
type PaymentRow = { id: number; status: string }

function stockMovementCount(): number {
  return (getDatabase().prepare('SELECT COUNT(*) AS count FROM stock_movements').get() as { count: number }).count
}

function schemeToInput(scheme: GoldSavingScheme, overrides: Partial<GoldSavingSchemeInput> = {}): GoldSavingSchemeInput {
  return {
    name: scheme.name,
    description: scheme.description,
    monthlyAmount: scheme.monthlyAmount,
    durationMonths: scheme.durationMonths,
    minInstallment: scheme.minInstallment,
    maxInstallment: scheme.maxInstallment,
    purity: scheme.purity,
    goldRateSource: scheme.goldRateSource,
    bonusType: scheme.bonusType,
    bonusValue: scheme.bonusValue,
    bonusEligibility: scheme.bonusEligibility,
    allowLatePayments: scheme.allowLatePayments,
    gracePeriodDays: scheme.gracePeriodDays,
    allowMissedInstallments: scheme.allowMissedInstallments,
    allowEarlyClosure: scheme.allowEarlyClosure,
    allowPartialRedemption: scheme.allowPartialRedemption,
    allowMultipleAccounts: scheme.allowMultipleAccounts,
    redemptionType: scheme.redemptionType,
    makingChargeRules: scheme.makingChargeRules,
    wastageRules: scheme.wastageRules,
    availableFrom: scheme.availableFrom,
    availableTo: scheme.availableTo,
    terms: scheme.terms,
    status: scheme.status,
    ...overrides,
  }
}

describe('gold savings schemes', () => {
  useIntegrationEnv()

  async function seedRate(date = TODAY, gold22k = 10000, gold24k = 11000) {
    const rates = await getTestAgent().post('/api/metal-rates').send({
      effectiveDate: date,
      gold22k,
      gold24k,
      silverFine: 100,
    })
    expect(rates.status).toBe(200)
  }

  async function seedCustomer(name = 'Lakshmi', phone = '9876500100') {
    const customer = await getTestAgent().post('/api/customers').send({
      name,
      phone,
      address: 'Salem',
    })
    expect(customer.status).toBe(201)
    return customer.body as { id: number; name: string }
  }

  async function createScheme(overrides: Partial<GoldSavingSchemeInput> & { name: string }) {
    const created = await getTestAgent()
      .post('/api/gold-savings/schemes')
      .send({
        monthlyAmount: 2000,
        durationMonths: 11,
        purity: '22K',
        goldRateSource: 'configured',
        bonusType: 'none',
        redemptionType: 'jewellery',
        ...overrides,
      })
    expect(created.status).toBe(201)
    return created.body as GoldSavingScheme
  }

  async function enrollAndPay(
    customerId: number,
    schemeId: number,
    date = TODAY,
    opts?: {
      monthlyAmount?: number
      firstInstallmentDate?: string
      amount?: number
      paymentDate?: string
      paymentMode?: string
      skipInitialPayment?: boolean
    },
  ) {
    return getTestAgent()
      .post('/api/gold-savings/accounts')
      .send({
        customerId,
        schemeId,
        enrollmentDate: date,
        firstInstallmentDate: opts?.firstInstallmentDate ?? date,
        monthlyAmount: opts?.monthlyAmount,
        termsAccepted: true,
        initialPayment: opts?.skipInitialPayment
          ? undefined
          : {
              amount: opts?.amount ?? 2000,
              paymentDate: opts?.paymentDate ?? date,
              paymentMode: opts?.paymentMode ?? 'cash',
            },
      })
  }

  function installmentOf(body: { installments: Installment[] }, n: number): Installment {
    const row = body.installments.find((item) => item.installmentNo === n)
    if (!row) throw new Error(`Installment ${n} not found`)
    return row
  }

  it('creates a scheme, enrolls, collects, and keeps inventory untouched', async () => {
    await seedRate()
    const customer = await seedCustomer()

    const schemeRes = await getTestAgent().post('/api/gold-savings/schemes').send({
      name: 'Monthly Gold 2000',
      monthlyAmount: 2000,
      durationMonths: 11,
      purity: '22K',
      goldRateSource: 'configured',
      bonusType: 'none',
      redemptionType: 'jewellery',
    })
    expect(schemeRes.status).toBe(201)
    expect(schemeRes.body.code).toMatch(/^GS-/)

    const enrolled = await getTestAgent().post('/api/gold-savings/accounts').send({
      customerId: customer.id,
      schemeId: schemeRes.body.id,
      enrollmentDate: TODAY,
      firstInstallmentDate: TODAY,
      termsAccepted: true,
      initialPayment: {
        amount: 2000,
        paymentDate: TODAY,
        paymentMode: 'cash',
      },
    })
    expect(enrolled.status).toBe(201)
    expect(enrolled.body.account.accountNo).toMatch(/^GS-202609-/)
    expect(enrolled.body.installments).toHaveLength(11)
    expect(enrolled.body.payments).toHaveLength(1)
    expect(enrolled.body.payments[0].goldWeight).toBe(0.2)
    expect(enrolled.body.payments[0].goldRate).toBe(10000)
    expect(enrolled.body.account.goldAccumulated).toBe(0.2)
    expect(enrolled.body.ledger[0].cumulativeGold).toBe(0.2)

    const duplicate = await getTestAgent().post('/api/gold-savings/accounts').send({
      customerId: customer.id,
      schemeId: schemeRes.body.id,
      enrollmentDate: TODAY,
      firstInstallmentDate: TODAY,
      termsAccepted: true,
    })
    expect(duplicate.status).toBe(400)
    expect(duplicate.body.error).toMatch(/already has an active account/)

    const next = enrolled.body.installments.find(
      (row: { status: string; installmentNo: number }) => row.installmentNo === 2,
    )
    const payOnce = await getTestAgent().post('/api/gold-savings/payments').send({
      accountId: enrolled.body.account.id,
      installmentId: next.id,
      paymentDate: TODAY,
      amount: 2000,
      paymentMode: 'upi',
      idempotencyKey: 'pay-2-once',
    })
    expect(payOnce.status).toBe(201)
    expect(payOnce.body.goldWeight).toBe(0.2)

    const payAgain = await getTestAgent().post('/api/gold-savings/payments').send({
      accountId: enrolled.body.account.id,
      installmentId: next.id,
      paymentDate: TODAY,
      amount: 2000,
      paymentMode: 'upi',
      idempotencyKey: 'pay-2-once',
    })
    expect(payAgain.status).toBe(201)
    expect(payAgain.body.id).toBe(payOnce.body.id)

    const payDuplicateInstallment = await getTestAgent().post('/api/gold-savings/payments').send({
      accountId: enrolled.body.account.id,
      installmentId: next.id,
      paymentDate: TODAY,
      amount: 2000,
      paymentMode: 'cash',
      idempotencyKey: 'pay-2-other',
    })
    expect(payDuplicateInstallment.status).toBe(400)

    const detail = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}`)
    expect(detail.body.account.paidInstallments).toBe(2)
    expect(detail.body.account.goldAccumulated).toBe(0.4)

    const reversed = await getTestAgent()
      .post(`/api/gold-savings/payments/${payOnce.body.id}/reverse`)
      .send({ reason: 'Entered twice' })
    expect(reversed.status).toBe(200)
    expect(reversed.body.status).toBe('reversed')

    const afterReverse = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}`)
    expect(afterReverse.body.account.goldAccumulated).toBe(0.2)
    expect(afterReverse.body.payments.some((row: { status: string }) => row.status === 'reversed')).toBe(true)

    const movements = getDatabase().prepare('SELECT COUNT(*) AS count FROM stock_movements').get() as {
      count: number
    }
    expect(movements.count).toBe(0)

    const dashboard = await getTestAgent().get('/api/gold-savings/dashboard')
    expect(dashboard.status).toBe(200)
    expect(dashboard.body.activeSchemes).toBe(1)
    expect(dashboard.body.totalGold).toBe(0.2)
    expect(dashboard.body.monthTarget).toBeGreaterThan(0)
    expect(dashboard.body.overdueAging).toHaveLength(4)
    expect(dashboard.body.maturityPipeline).toHaveLength(4)
  })

  it('credits later installments at the live rate and reprints the original receipt snapshot', async () => {
    await seedRate()
    const customer = await seedCustomer()
    const schemeRes = await getTestAgent().post('/api/gold-savings/schemes').send({
      name: 'Variable Rate Gold',
      monthlyAmount: 2000,
      durationMonths: 3,
      purity: '22K',
      goldRateSource: 'configured',
      bonusType: 'none',
      redemptionType: 'jewellery',
    })
    expect(schemeRes.status).toBe(201)

    const enrolled = await getTestAgent().post('/api/gold-savings/accounts').send({
      customerId: customer.id,
      schemeId: schemeRes.body.id,
      enrollmentDate: TODAY,
      firstInstallmentDate: TODAY,
      termsAccepted: true,
      initialPayment: {
        amount: 2000,
        paymentDate: TODAY,
        paymentMode: 'cash',
      },
    })
    expect(enrolled.status).toBe(201)
    const firstPaymentId = enrolled.body.payments[0].id as number
    expect(enrolled.body.payments[0].customerPhone).toBe('9876500100')
    expect(enrolled.body.payments[0].durationMonths).toBe(3)
    expect(enrolled.body.payments[0].customerId).toBe(customer.id)

    const nextRate = await getTestAgent().post('/api/metal-rates').send({
      effectiveDate: TODAY,
      gold22k: 20000,
      gold24k: 22000,
      silverFine: 100,
    })
    expect(nextRate.status).toBe(200)

    const second = enrolled.body.installments.find(
      (row: { status: string; installmentNo: number }) => row.installmentNo === 2,
    )
    const paySecond = await getTestAgent().post('/api/gold-savings/payments').send({
      accountId: enrolled.body.account.id,
      installmentId: second.id,
      paymentDate: TODAY,
      amount: 2000,
      paymentMode: 'cash',
    })
    expect(paySecond.status).toBe(201)
    expect(paySecond.body.goldRate).toBe(20000)
    expect(paySecond.body.goldWeight).toBe(0.1)
    expect(paySecond.body.goldAccumulatedToDate).toBe(0.3)

    const reprintFirst = await getTestAgent().get(`/api/gold-savings/payments/${firstPaymentId}`)
    expect(reprintFirst.status).toBe(200)
    expect(reprintFirst.body.goldRate).toBe(10000)
    expect(reprintFirst.body.goldWeight).toBe(0.2)
    expect(reprintFirst.body.totalPaidToDate).toBe(2000)
    expect(reprintFirst.body.goldAccumulatedToDate).toBe(0.2)

    const reversed = await getTestAgent()
      .post(`/api/gold-savings/payments/${paySecond.body.id}/reverse`)
      .send({ reason: 'Wrong rate day' })
    expect(reversed.status).toBe(200)

    const reprintReversed = await getTestAgent().get(`/api/gold-savings/payments/${paySecond.body.id}`)
    expect(reprintReversed.body.status).toBe('reversed')
    expect(reprintReversed.body.goldRate).toBe(20000)
    expect(reprintReversed.body.goldWeight).toBe(0.1)
    expect(reprintReversed.body.goldAccumulatedToDate).toBe(0.3)

    const passbook = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}/passbook`)
    expect(passbook.status).toBe(200)
    expect(passbook.body.rows.filter((row: { entryType: string }) => row.entryType === 'payment')).toHaveLength(1)
    expect(passbook.body.account.goldAccumulated).toBe(0.2)
    expect(typeof passbook.body.scheme.terms).toBe('string')
    expect(passbook.body.account.accountNo).toBeTruthy()
    expect(passbook.body.account.customerName).toBeTruthy()
  })

  it('applies configured bonus gold at redemption and never writes stock movements', async () => {
    await seedRate()
    const customer = await seedCustomer()
    const schemeRes = await getTestAgent().post('/api/gold-savings/schemes').send({
      name: 'Bonus Gold 2 months',
      monthlyAmount: 2000,
      durationMonths: 2,
      purity: '22K',
      goldRateSource: 'configured',
      bonusType: 'additional_gold',
      bonusValue: 0.5,
      redemptionType: 'jewellery',
    })
    expect(schemeRes.status).toBe(201)

    const enrolled = await getTestAgent().post('/api/gold-savings/accounts').send({
      customerId: customer.id,
      schemeId: schemeRes.body.id,
      enrollmentDate: TODAY,
      firstInstallmentDate: TODAY,
      termsAccepted: true,
      initialPayment: { amount: 2000, paymentDate: TODAY, paymentMode: 'cash' },
    })
    const second = enrolled.body.installments.find(
      (row: { installmentNo: number }) => row.installmentNo === 2,
    )
    await getTestAgent().post('/api/gold-savings/payments').send({
      accountId: enrolled.body.account.id,
      installmentId: second.id,
      paymentDate: TODAY,
      amount: 2000,
      paymentMode: 'upi',
    })

    const tooEarly = await getTestAgent().post('/api/gold-savings/redemptions').send({
      accountId: enrolled.body.account.id,
      redemptionDate: TODAY,
      redemptionKind: 'jewellery',
      goldWeight: 1.5,
    })
    expect(tooEarly.status).toBe(400)

    const redeemed = await getTestAgent().post('/api/gold-savings/redemptions').send({
      accountId: enrolled.body.account.id,
      redemptionDate: TODAY,
      redemptionKind: 'jewellery',
    })
    expect(redeemed.status).toBe(201)
    expect(redeemed.body.goldWeight).toBe(0.9)
    expect(redeemed.body.bonusGoldWeight).toBe(0.5)
    expect(redeemed.body.remainingGold).toBe(0)
    expect(redeemed.body.closesAccount).toBe(true)

    const detail = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}`)
    expect(detail.body.account.status).toBe('redeemed')
    expect(detail.body.account.goldAccumulated).toBe(0)

    const movements = getDatabase().prepare('SELECT COUNT(*) AS count FROM stock_movements').get() as {
      count: number
    }
    expect(movements.count).toBe(0)

    const blocked = await getTestAgent().delete(`/api/customers/${customer.id}`)
    expect(blocked.status).toBe(400)
    expect(blocked.body.error).toMatch(/gold savings/i)

    const daily = await getTestAgent().get('/api/gold-savings/reports/daily-collections')
    expect(daily.status).toBe(200)
    expect(daily.body.columns).toEqual(['Date', 'Receipt', 'Account', 'Customer', 'Amount', 'Rate', 'Gold', 'Mode'])
    expect(daily.body.rows[0].Customer).toBe('Lakshmi')
    expect(daily.body.rows[0].Amount).toBe(2000)

    const aging = await getTestAgent().get('/api/gold-savings/reports/overdue-aging')
    expect(aging.status).toBe(200)
    expect(aging.body.columns).toEqual([
      'Account',
      'Customer',
      'Scheme',
      'Installment',
      'Due',
      'Days overdue',
      'Amount',
      'Bucket',
    ])
    for (const row of aging.body.rows as Array<Record<string, string | number>>) {
      expect(row['Days overdue']).toBeGreaterThanOrEqual(1)
      expect(['1-7 days', '8-15 days', '16-30 days', '30+ days']).toContain(row.Bucket)
    }
  })

  it('denies gold savings APIs to staff without the feature', async () => {
    const created = await getTestAgent().post('/api/users').send({
      username: 'gs-cashier',
      password: 'staff123',
      role: 'staff',
      features: ['billing'],
    })
    expect(created.status).toBe(201)
    await getTestAgent().post('/api/auth/logout')
    const staffLogin = await getTestAgent().post('/api/auth/login').send({
      username: 'gs-cashier',
      password: 'staff123',
    })
    expect(staffLogin.status).toBe(200)
    const denied = await getTestAgent().get('/api/gold-savings/dashboard')
    expect(denied.status).toBe(403)
  })

  describe('worst-case records', () => {
    it('record 1: rejects enrollment below min or above max installment and accepts a valid amount', async () => {
      await seedRate()
      const customer = await seedCustomer('MinMax Customer', '9876501101')
      const scheme = await createScheme({
        name: 'Bounded Installment',
        minInstallment: 1500,
        maxInstallment: 3000,
      })

      const belowMin = await enrollAndPay(customer.id, scheme.id, TODAY, { monthlyAmount: 1000 })
      expect(belowMin.status).toBe(400)
      expect(belowMin.body.error).toMatch(/below the scheme minimum/)

      const aboveMax = await enrollAndPay(customer.id, scheme.id, TODAY, { monthlyAmount: 4000 })
      expect(aboveMax.status).toBe(400)
      expect(aboveMax.body.error).toMatch(/exceeds the scheme maximum/)

      const enrolled = await enrollAndPay(customer.id, scheme.id, TODAY, { monthlyAmount: 2000 })
      expect(enrolled.status).toBe(201)
      expect(enrolled.body.account.monthlyAmount).toBe(2000)
      expect(enrolled.body.account.goldAccumulated).toBe(0.2)
      expect(stockMovementCount()).toBe(0)
    })

    it('record 2: blocks a second active account then allows re-enroll after cancel', async () => {
      await seedRate()
      const customer = await seedCustomer('Duplicate Account', '9876501102')
      const scheme = await createScheme({
        name: 'Single Account Scheme',
        durationMonths: 3,
      })

      const first = await enrollAndPay(customer.id, scheme.id)
      expect(first.status).toBe(201)

      const duplicate = await enrollAndPay(customer.id, scheme.id, TODAY, { skipInitialPayment: true })
      expect(duplicate.status).toBe(400)
      expect(duplicate.body.error).toMatch(/already has an active account/)

      const cancelled = await getTestAgent()
        .post(`/api/gold-savings/accounts/${first.body.account.id}/cancel`)
        .send({ reason: 'Closed so the customer can re-enroll' })
      expect(cancelled.status).toBe(200)
      expect(cancelled.body.account.status).toBe('cancelled')

      const reenrolled = await enrollAndPay(customer.id, scheme.id)
      expect(reenrolled.status).toBe(201)
      expect(reenrolled.body.account.id).not.toBe(first.body.account.id)
      expect(reenrolled.body.account.status).toBe('active')
    })

    it('record 3: rejects late collection after grace and accepts payment on the last grace day', async () => {
      await seedRate()
      const customer = await seedCustomer('Late Payer', '9876501103')
      const scheme = await createScheme({
        name: 'No Late Payments',
        durationMonths: 3,
        allowLatePayments: false,
        gracePeriodDays: 3,
      })

      const enrolled = await enrollAndPay(customer.id, scheme.id, '2026-08-01')
      expect(enrolled.status).toBe(201)
      const second = installmentOf(enrolled.body, 2)
      expect(second).toBeTruthy()

      const tooLate = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: '2026-09-05',
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(tooLate.status).toBe(400)
      expect(tooLate.body.error).toMatch(/Late payments are not allowed/)

      const withinGrace = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: '2026-09-04',
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(withinGrace.status).toBe(201)
      expect(withinGrace.body.goldWeight).toBe(0.2)
    })

    it('record 4: blocks skipping ahead when missed installments are not allowed', async () => {
      await seedRate()
      const customer = await seedCustomer('Sequential Payer', '9876501104')
      const scheme = await createScheme({
        name: 'Sequential Only',
        durationMonths: 4,
        allowMissedInstallments: false,
      })

      const enrolled = await enrollAndPay(customer.id, scheme.id)
      expect(enrolled.status).toBe(201)
      const second = installmentOf(enrolled.body, 2)
      const third = installmentOf(enrolled.body, 3)

      const skipped = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: third.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(skipped.status).toBe(400)
      expect(skipped.body.error).toMatch(/next unpaid installment before skipping ahead/)

      const paySecond = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'upi',
      })
      expect(paySecond.status).toBe(201)

      const payThird = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: third.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'upi',
      })
      expect(payThird.status).toBe(201)

      const detail = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}`)
      expect(detail.body.account.paidInstallments).toBe(3)
    })

    it('record 5: enforces manual gold-rate override rules for admin, staff, and configured schemes', async () => {
      await seedRate()
      const customer = await seedCustomer('Rate Override', '9876501105')
      const manualScheme = await createScheme({
        name: 'Manual Rate Allowed',
        durationMonths: 3,
        goldRateSource: 'manual_allowed',
      })
      const configuredScheme = await createScheme({
        name: 'Configured Rate Only',
        durationMonths: 3,
        goldRateSource: 'configured',
      })

      const staff = await getTestAgent().post('/api/users').send({
        username: 'gs-collector',
        password: 'staff123',
        role: 'staff',
        features: ['gold_savings'],
      })
      expect(staff.status).toBe(201)

      const enrolled = await enrollAndPay(customer.id, manualScheme.id)
      expect(enrolled.status).toBe(201)
      const second = installmentOf(enrolled.body, 2)

      const missingReason = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
        goldRate: 12000,
      })
      expect(missingReason.status).toBe(400)
      expect(missingReason.body.error).toMatch(/reason is required/i)

      await getTestAgent().post('/api/auth/logout')
      const staffLogin = await getTestAgent().post('/api/auth/login').send({
        username: 'gs-collector',
        password: 'staff123',
      })
      expect(staffLogin.status).toBe(200)

      const staffOverride = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
        goldRate: 12000,
        goldRateOverrideReason: 'Festival rate',
      })
      expect(staffOverride.status).toBe(400)
      expect(staffOverride.body.error).toMatch(/Permission denied to override the gold rate/)

      await getTestAgent().post('/api/auth/logout')
      await loginAsAdmin()

      const adminOverride = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
        goldRate: 12000,
        goldRateOverrideReason: 'Festival rate',
      })
      expect(adminOverride.status).toBe(201)
      expect(adminOverride.body.goldRate).toBe(12000)
      expect(adminOverride.body.goldWeight).toBe(0.167)
      expect(adminOverride.body.goldRateSource).toBe('manual')

      const ledger = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}/ledger`)
      expect(ledger.status).toBe(200)
      const overrideEntry = (ledger.body as LedgerEntry[]).find((row) => row.goldRate === 12000)
      expect(overrideEntry?.goldWeight).toBe(0.167)

      const configuredCustomer = await seedCustomer('Configured Rate', '9876501106')
      const configuredEnroll = await enrollAndPay(configuredCustomer.id, configuredScheme.id)
      expect(configuredEnroll.status).toBe(201)
      const configuredSecond = installmentOf(configuredEnroll.body, 2)
      const blockedOverride = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: configuredEnroll.body.account.id,
        installmentId: configuredSecond.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
        goldRate: 12000,
        goldRateOverrideReason: 'Should not apply',
      })
      expect(blockedOverride.status).toBe(400)
      expect(blockedOverride.body.error).toMatch(/Manual gold rates are not allowed/)
    })

    it('record 6: retries the same idempotency key and rejects a second posted payment on the same installment', async () => {
      await seedRate()
      const customer = await seedCustomer('Idempotent Payer', '9876501107')
      const scheme = await createScheme({
        name: 'Idempotent Collections',
        durationMonths: 3,
      })
      const enrolled = await enrollAndPay(customer.id, scheme.id)
      expect(enrolled.status).toBe(201)
      const second = installmentOf(enrolled.body, 2)

      const first = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'upi',
        idempotencyKey: 'key-A',
      })
      expect(first.status).toBe(201)

      const retry = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'upi',
        idempotencyKey: 'key-A',
      })
      expect(retry.status).toBe(201)
      expect(retry.body.id).toBe(first.body.id)

      const differentKey = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
        idempotencyKey: 'key-B',
      })
      expect(differentKey.status).toBe(400)

      const detail = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}`)
      const posted = (detail.body.payments as PaymentRow[]).filter((row) => row.status === 'posted')
      expect(posted).toHaveLength(2)
    })

    it('record 7: reverses a matured payment, restores gold, and keeps the receipt snapshot', async () => {
      await seedRate()
      const customer = await seedCustomer('Reversal Snapshot', '9876501108')
      const scheme = await createScheme({
        name: 'Two Month Reversal',
        durationMonths: 2,
      })
      const enrolled = await enrollAndPay(customer.id, scheme.id)
      expect(enrolled.status).toBe(201)
      const firstPaymentId = enrolled.body.payments[0].id as number
      const second = installmentOf(enrolled.body, 2)

      await seedRate(TODAY, 20000, 22000)
      const paySecond = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(paySecond.status).toBe(201)
      expect(paySecond.body.goldRate).toBe(20000)
      expect(paySecond.body.goldWeight).toBe(0.1)
      expect(paySecond.body.goldAccumulatedToDate).toBe(0.3)

      const matured = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}`)
      expect(matured.body.account.status).toBe('matured')
      expect(matured.body.account.goldAccumulated).toBe(0.3)

      const reversed = await getTestAgent()
        .post(`/api/gold-savings/payments/${paySecond.body.id}/reverse`)
        .send({ reason: 'Wrong rate day' })
      expect(reversed.status).toBe(200)
      expect(reversed.body.status).toBe('reversed')

      const after = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}`)
      expect(after.body.account.goldAccumulated).toBe(0.2)
      expect(after.body.account.status).toBe('active')
      expect((after.body.ledger as LedgerEntry[]).some((row) => row.entryType === 'reversal' && row.goldWeight === -0.1)).toBe(
        true,
      )

      const reprintFirst = await getTestAgent().get(`/api/gold-savings/payments/${firstPaymentId}`)
      expect(reprintFirst.body.goldRate).toBe(10000)
      expect(reprintFirst.body.goldWeight).toBe(0.2)

      const reprintReversed = await getTestAgent().get(`/api/gold-savings/payments/${paySecond.body.id}`)
      expect(reprintReversed.body.status).toBe('reversed')
      expect(reprintReversed.body.goldRate).toBe(20000)
      expect(reprintReversed.body.goldWeight).toBe(0.1)
      expect(reprintReversed.body.goldAccumulatedToDate).toBe(0.3)

      const passbook = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}/passbook`)
      expect(passbook.body.rows.filter((row: { entryType: string }) => row.entryType === 'payment')).toHaveLength(1)
      expect(passbook.body.rows.some((row: { entryType: string }) => row.entryType === 'reversal')).toBe(true)
      expect(passbook.body.account.goldAccumulated).toBe(0.2)
      expect(stockMovementCount()).toBe(0)
    })

    it('record 8: applies additional, percentage, and fixed-amount bonus only after all installments are paid', async () => {
      await seedRate()

      const additionalCustomer = await seedCustomer('Bonus Additional', '9876501109')
      const additionalScheme = await createScheme({
        name: 'Additional Gold Bonus',
        durationMonths: 2,
        bonusType: 'additional_gold',
        bonusValue: 0.5,
      })
      const additionalEnroll = await enrollAndPay(additionalCustomer.id, additionalScheme.id)
      expect(additionalEnroll.status).toBe(201)

      const tooEarly = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: additionalEnroll.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'jewellery',
      })
      expect(tooEarly.status).toBe(201)
      expect(tooEarly.body.bonusGoldWeight).toBe(0)
      expect(tooEarly.body.goldWeight).toBe(0.2)
      expect(tooEarly.body.closesAccount).toBe(true)

      const additionalFullCustomer = await seedCustomer('Bonus Additional Full', '9876501110')
      const additionalFull = await enrollAndPay(additionalFullCustomer.id, additionalScheme.id)
      const additionalSecond = installmentOf(additionalFull.body, 2)
      await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: additionalFull.body.account.id,
        installmentId: additionalSecond.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'upi',
      })
      const additionalRedeem = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: additionalFull.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'jewellery',
      })
      expect(additionalRedeem.status).toBe(201)
      expect(additionalRedeem.body.goldWeight).toBe(0.9)
      expect(additionalRedeem.body.bonusGoldWeight).toBe(0.5)
      expect(additionalRedeem.body.closesAccount).toBe(true)

      const additionalDetail = await getTestAgent().get(`/api/gold-savings/accounts/${additionalFull.body.account.id}`)
      expect(additionalDetail.body.account.status).toBe('redeemed')
      const additionalLedger = additionalDetail.body.ledger as LedgerEntry[]
      expect(additionalLedger.some((row) => row.entryType === 'bonus' && row.goldWeight === 0.5)).toBe(true)
      expect(additionalLedger.some((row) => row.entryType === 'redemption' && row.goldWeight === -0.9)).toBe(true)

      const percentCustomer = await seedCustomer('Bonus Percent', '9876501111')
      const percentScheme = await createScheme({
        name: 'Percent Gold Bonus',
        durationMonths: 2,
        bonusType: 'percentage',
        bonusValue: 10,
      })
      const percentEnroll = await enrollAndPay(percentCustomer.id, percentScheme.id)
      const percentSecond = installmentOf(percentEnroll.body, 2)
      await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: percentEnroll.body.account.id,
        installmentId: percentSecond.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      const percentRedeem = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: percentEnroll.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'jewellery',
      })
      expect(percentRedeem.status).toBe(201)
      expect(percentRedeem.body.bonusGoldWeight).toBe(0.04)
      expect(percentRedeem.body.goldWeight).toBe(0.44)

      const fixedCustomer = await seedCustomer('Bonus Fixed', '9876501112')
      const fixedScheme = await createScheme({
        name: 'Fixed Amount Bonus',
        durationMonths: 2,
        bonusType: 'fixed_amount',
        bonusValue: 500,
      })
      const fixedEnroll = await enrollAndPay(fixedCustomer.id, fixedScheme.id)
      const fixedSecond = installmentOf(fixedEnroll.body, 2)
      await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: fixedEnroll.body.account.id,
        installmentId: fixedSecond.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'card',
      })
      const fixedRedeem = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: fixedEnroll.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'jewellery',
      })
      expect(fixedRedeem.status).toBe(201)
      expect(fixedRedeem.body.bonusGoldWeight).toBe(0.05)
      expect(fixedRedeem.body.goldWeight).toBe(0.45)
      expect(stockMovementCount()).toBe(0)
    })

    it('record 9: enforces partial redemption, early closure, and over-request limits', async () => {
      await seedRate()
      const partialCustomer = await seedCustomer('Partial Redeem', '9876501113')
      const partialScheme = await createScheme({
        name: 'Partial Allowed',
        durationMonths: 4,
        allowPartialRedemption: true,
        allowEarlyClosure: true,
      })
      const partialEnroll = await enrollAndPay(partialCustomer.id, partialScheme.id)
      for (const n of [2, 3, 4]) {
        const row = installmentOf(partialEnroll.body, n)
        const paid = await getTestAgent().post('/api/gold-savings/payments').send({
          accountId: partialEnroll.body.account.id,
          installmentId: row.id,
          paymentDate: TODAY,
          amount: 2000,
          paymentMode: 'cash',
        })
        expect(paid.status).toBe(201)
      }

      const overRequest = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: partialEnroll.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
        goldWeight: 99,
      })
      expect(overRequest.status).toBe(400)
      expect(overRequest.body.error).toMatch(/exceeds the eligible balance/)

      const firstHalf = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: partialEnroll.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
        goldWeight: 0.4,
      })
      expect(firstHalf.status).toBe(201)
      expect(firstHalf.body.closesAccount).toBe(false)
      expect(firstHalf.body.remainingGold).toBe(0.4)

      const afterPartial = await getTestAgent().get(`/api/gold-savings/accounts/${partialEnroll.body.account.id}`)
      expect(afterPartial.body.account.status).toBe('matured')
      expect(afterPartial.body.account.goldAccumulated).toBe(0.4)

      const remainder = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: partialEnroll.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
      })
      expect(remainder.status).toBe(201)
      expect(remainder.body.closesAccount).toBe(true)
      const closed = await getTestAgent().get(`/api/gold-savings/accounts/${partialEnroll.body.account.id}`)
      expect(closed.body.account.status).toBe('redeemed')

      const noPartialCustomer = await seedCustomer('No Partial', '9876501114')
      const noPartialScheme = await createScheme({
        name: 'Full Redeem Only',
        durationMonths: 2,
        allowPartialRedemption: false,
      })
      const noPartialEnroll = await enrollAndPay(noPartialCustomer.id, noPartialScheme.id)
      const noPartialSecond = installmentOf(noPartialEnroll.body, 2)
      await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: noPartialEnroll.body.account.id,
        installmentId: noPartialSecond.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      const blockedPartial = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: noPartialEnroll.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
        goldWeight: 0.1,
      })
      expect(blockedPartial.status).toBe(400)
      expect(blockedPartial.body.error).toMatch(/Partial redemption is not allowed/)

      const earlyCustomer = await seedCustomer('Early Close', '9876501115')
      const earlyScheme = await createScheme({
        name: 'No Early Closure',
        durationMonths: 4,
        allowPartialRedemption: true,
        allowEarlyClosure: false,
      })
      const earlyEnroll = await enrollAndPay(earlyCustomer.id, earlyScheme.id)
      const earlySecond = installmentOf(earlyEnroll.body, 2)
      await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: earlyEnroll.body.account.id,
        installmentId: earlySecond.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      const blockedEarly = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: earlyEnroll.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
        goldWeight: 0.2,
      })
      expect(blockedEarly.status).toBe(400)
      expect(blockedEarly.body.error).toMatch(/Early closure is not allowed/)

      const fullEarly = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: earlyEnroll.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
      })
      expect(fullEarly.status).toBe(201)
      expect(fullEarly.body.bonusGoldWeight).toBe(0)
      expect(fullEarly.body.goldWeight).toBe(0.4)
      expect(fullEarly.body.closesAccount).toBe(true)
    })

    it('record 10: blocks pay/redeem after cancel, customer delete, inactive enroll, and missing feature', async () => {
      await seedRate()
      const customer = await seedCustomer('Cancel Guard', '9876501116')
      const scheme = await createScheme({
        name: 'Cancellable Scheme',
        durationMonths: 3,
      })
      const enrolled = await enrollAndPay(customer.id, scheme.id)
      const second = installmentOf(enrolled.body, 2)
      const paySecond = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(paySecond.status).toBe(201)

      const cancelled = await getTestAgent()
        .post(`/api/gold-savings/accounts/${enrolled.body.account.id}/cancel`)
        .send({ reason: 'Customer left the scheme' })
      expect(cancelled.status).toBe(200)
      expect(cancelled.body.account.status).toBe('cancelled')
      expect(cancelled.body.account.closedAt).toBeTruthy()

      const third = installmentOf(enrolled.body, 3)
      const payCancelled = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: third.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(payCancelled.status).toBe(400)
      expect(payCancelled.body.error).toMatch(/closed scheme account/)

      const cancelAgain = await getTestAgent()
        .post(`/api/gold-savings/accounts/${enrolled.body.account.id}/cancel`)
        .send({ reason: 'Already cancelled' })
      expect(cancelAgain.status).toBe(400)
      expect(cancelAgain.body.error).toMatch(/already closed/)

      const redeemCancelled = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: enrolled.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'jewellery',
      })
      expect(redeemCancelled.status).toBe(400)
      expect(redeemCancelled.body.error).toMatch(/cannot be redeemed/)

      const blockedDelete = await getTestAgent().delete(`/api/customers/${customer.id}`)
      expect(blockedDelete.status).toBe(400)
      expect(blockedDelete.body.error).toMatch(/gold savings/i)

      const inactive = await getTestAgent()
        .put(`/api/gold-savings/schemes/${scheme.id}`)
        .send(schemeToInput(scheme, { status: 'inactive' }))
      expect(inactive.status).toBe(200)
      expect(inactive.body.status).toBe('inactive')

      const newCustomer = await seedCustomer('Inactive Enroll', '9876501117')
      const blockedEnroll = await enrollAndPay(newCustomer.id, scheme.id, TODAY, { skipInitialPayment: true })
      expect(blockedEnroll.status).toBe(400)
      expect(blockedEnroll.body.error).toMatch(/Cannot enroll into an inactive scheme/)

      const staff = await getTestAgent().post('/api/users').send({
        username: 'gs-no-feature',
        password: 'staff123',
        role: 'staff',
        features: ['billing'],
      })
      expect(staff.status).toBe(201)
      await getTestAgent().post('/api/auth/logout')
      const staffLogin = await getTestAgent().post('/api/auth/login').send({
        username: 'gs-no-feature',
        password: 'staff123',
      })
      expect(staffLogin.status).toBe(200)
      const denied = await getTestAgent().get('/api/gold-savings/dashboard')
      expect(denied.status).toBe(403)
    })
  })
})
