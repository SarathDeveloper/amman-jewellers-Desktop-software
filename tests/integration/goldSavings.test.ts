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
      'Mobile',
      'Scheme',
      'Installment',
      'Due',
      'Days overdue',
      'Amount',
      'Overdue count',
      'Bucket',
    ])
    for (const row of aging.body.rows as Array<Record<string, string | number>>) {
      expect(row['Days overdue']).toBeGreaterThanOrEqual(1)
      expect(row['Overdue count']).toBeGreaterThanOrEqual(1)
      expect(row.Mobile).toBe('9876500100')
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
      await seedRate('2026-08-01')
      await seedRate('2026-09-04')
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

  describe('phase 0 hardening', () => {
    it('record 11: re-collects a reversed payment with a fresh key and rejects the reused key', async () => {
      await seedRate()
      const customer = await seedCustomer('Reverse Recollect', '9876501118')
      const scheme = await createScheme({ name: 'Reverse Recollect', durationMonths: 2 })
      const enrolled = await enrollAndPay(customer.id, scheme.id, TODAY, { skipInitialPayment: true })
      expect(enrolled.status).toBe(201)
      const first = installmentOf(enrolled.body, 1)

      const collected = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: first.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
        idempotencyKey: 'rr-key-1',
      })
      expect(collected.status).toBe(201)

      const reversed = await getTestAgent()
        .post(`/api/gold-savings/payments/${collected.body.id}/reverse`)
        .send({ reason: 'Wrong payment mode' })
      expect(reversed.status).toBe(200)

      const retry = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: first.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
        idempotencyKey: 'rr-key-1',
      })
      expect(retry.status).toBe(400)
      expect(retry.body.error).toMatch(/reversed/)

      const fresh = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: first.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'card',
        idempotencyKey: 'rr-key-2',
      })
      expect(fresh.status).toBe(201)
      expect(fresh.body.id).not.toBe(collected.body.id)

      const detail = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}`)
      const posted = (detail.body.payments as PaymentRow[]).filter((row) => row.status === 'posted')
      expect(posted).toHaveLength(1)
      expect((detail.body.installments as Installment[]).find((row) => row.installmentNo === 1)?.status).toBe('paid')
    })

    it('record 12: blocks reversing a payment after redemption', async () => {
      await seedRate()
      const customer = await seedCustomer('Reverse After Redeem', '9876501119')
      const scheme = await createScheme({ name: 'Reverse After Redeem', durationMonths: 2 })
      const enrolled = await enrollAndPay(customer.id, scheme.id)
      expect(enrolled.status).toBe(201)
      const second = installmentOf(enrolled.body, 2)
      const paySecond = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: second.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(paySecond.status).toBe(201)

      const redeemed = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: enrolled.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
      })
      expect(redeemed.status).toBe(201)
      expect(redeemed.body.closesAccount).toBe(true)

      const reversed = await getTestAgent()
        .post(`/api/gold-savings/payments/${paySecond.body.id}/reverse`)
        .send({ reason: 'Too late' })
      expect(reversed.status).toBe(400)
      expect(reversed.body.error).toMatch(/redeemed|closed scheme account/)

      const after = await getTestAgent().get(`/api/gold-savings/accounts/${enrolled.body.account.id}`)
      expect(after.body.account.goldAccumulated).toBe(0)
      expect(after.body.account.status).toBe('redeemed')
    })

    it('record 13: credits bonus only once across partial redemptions', async () => {
      await seedRate()

      const additionalCustomer = await seedCustomer('Bonus Once Additional', '9876501120')
      const additionalScheme = await createScheme({
        name: 'Bonus Once Additional',
        durationMonths: 2,
        bonusType: 'additional_gold',
        bonusValue: 0.5,
        allowPartialRedemption: true,
        allowEarlyClosure: true,
      })
      const additional = await enrollAndPay(additionalCustomer.id, additionalScheme.id)
      const additionalSecond = installmentOf(additional.body, 2)
      await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: additional.body.account.id,
        installmentId: additionalSecond.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })

      const additionalFirstRedeem = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: additional.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
        goldWeight: 0.2,
      })
      expect(additionalFirstRedeem.status).toBe(201)
      expect(additionalFirstRedeem.body.bonusGoldWeight).toBe(0.5)
      expect(additionalFirstRedeem.body.closesAccount).toBe(false)

      const additionalRemainder = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: additional.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
      })
      expect(additionalRemainder.status).toBe(201)
      expect(additionalRemainder.body.bonusGoldWeight).toBe(0)
      expect(additionalRemainder.body.closesAccount).toBe(true)

      const percentCustomer = await seedCustomer('Bonus Once Percent', '9876501121')
      const percentScheme = await createScheme({
        name: 'Bonus Once Percent',
        durationMonths: 2,
        bonusType: 'percentage',
        bonusValue: 10,
        allowPartialRedemption: true,
        allowEarlyClosure: true,
      })
      const percent = await enrollAndPay(percentCustomer.id, percentScheme.id)
      const percentSecond = installmentOf(percent.body, 2)
      await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: percent.body.account.id,
        installmentId: percentSecond.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })

      const percentFirstRedeem = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: percent.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
        goldWeight: 0.2,
      })
      expect(percentFirstRedeem.status).toBe(201)
      expect(percentFirstRedeem.body.bonusGoldWeight).toBe(0.04)

      const percentRemainder = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: percent.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
      })
      expect(percentRemainder.status).toBe(201)
      expect(percentRemainder.body.bonusGoldWeight).toBe(0)
    })

    it('record 14: denies scheme create and update to staff', async () => {
      await seedRate()
      const scheme = await createScheme({ name: 'Admin Owned Scheme', durationMonths: 2 })

      const staff = await getTestAgent().post('/api/users').send({
        username: 'gs-scheme-staff',
        password: 'staff123',
        role: 'staff',
        features: ['gold_savings'],
      })
      expect(staff.status).toBe(201)
      await getTestAgent().post('/api/auth/logout')
      const login = await getTestAgent().post('/api/auth/login').send({
        username: 'gs-scheme-staff',
        password: 'staff123',
      })
      expect(login.status).toBe(200)

      const created = await getTestAgent().post('/api/gold-savings/schemes').send({
        name: 'Staff Created Scheme',
        monthlyAmount: 2000,
        durationMonths: 11,
      })
      expect(created.status).toBe(403)

      const updated = await getTestAgent()
        .put(`/api/gold-savings/schemes/${scheme.id}`)
        .send(schemeToInput(scheme, { name: 'Staff Edited Scheme' }))
      expect(updated.status).toBe(403)

      const listed = await getTestAgent().get('/api/gold-savings/schemes')
      expect(listed.status).toBe(200)
    })
  })

  describe('phase 1: scheme credit on a sale bill', () => {
    async function paySecondInstallment(accountId: number, installmentId: number) {
      const paid = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId,
        installmentId,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(paid.status).toBe(201)
    }

    async function createInvoiceWithScheme(
      customerId: number,
      accountId: number | null,
      netWeight = 2,
    ) {
      return getTestAgent().post('/api/invoices').send({
        customerId,
        invoiceDate: TODAY,
        tax: 0,
        autoTax: false,
        items: [{ qty: 1, rate: 5000, metalRate: 5000, netWeight, description: 'Bill line' }],
        goldSavingLinks: accountId ? [{ accountId }] : undefined,
      })
    }

    async function maturedAccount(customerId: number, schemeId: number) {
      const enrolled = await enrollAndPay(customerId, schemeId)
      expect(enrolled.status).toBe(201)
      await paySecondInstallment(enrolled.body.account.id, installmentOf(enrolled.body, 2).id)
      return enrolled.body.account.id as number
    }

    it('record 15: applies a scheme credit and creates one redemption at finalize', async () => {
      await seedRate()
      const customer = await seedCustomer('Bill Credit', '9876501122')
      const scheme = await createScheme({ name: 'Bill Credit Scheme', durationMonths: 2 })
      const accountId = await maturedAccount(customer.id, scheme.id)

      const draft = await createInvoiceWithScheme(customer.id, accountId, 2)
      expect(draft.status).toBe(201)
      expect(draft.body.subtotal).toBe(10000)
      expect(draft.body.amountPayable).toBe(6000)
      expect(draft.body.goldSavingLinks).toHaveLength(1)
      expect(draft.body.goldSavingLinks[0].amountApplied).toBe(4000)
      expect(draft.body.goldSavingLinks[0].goldWeight).toBe(0.4)
      expect(draft.body.goldSavingLinks[0].redemptionId).toBeNull()

      const beforeFinal = await getTestAgent().get(`/api/gold-savings/accounts/${accountId}`)
      expect(beforeFinal.body.redemptions).toHaveLength(0)

      const finalized = await getTestAgent().post(`/api/invoices/${draft.body.id}/finalize`)
      expect(finalized.status).toBe(200)
      expect(finalized.body.status).toBe('final')
      expect(finalized.body.goldSavingLinks[0].redemptionId).toBeTruthy()

      const detail = await getTestAgent().get(`/api/gold-savings/accounts/${accountId}`)
      expect(detail.body.account.status).toBe('redeemed')
      expect(detail.body.redemptions).toHaveLength(1)
      expect(detail.body.redemptions[0].redemptionKind).toBe('invoice')
      expect(detail.body.redemptions[0].invoiceId).toBe(draft.body.id)
      expect(detail.body.account.goldAccumulated).toBe(0)
      expect(stockMovementCount()).toBe(0)

      // A bill that redeemed a scheme must never be cancelled, or the redemption
      // would be silently orphaned.
      const blocked = await getTestAgent()
        .post(`/api/invoices/${draft.body.id}/cancel`)
        .send({ reason: 'Try to undo the redemption' })
      expect(blocked.status).toBe(400)
      expect(blocked.body.error).toMatch(/gold savings scheme/i)
      const stillFinal = await getTestAgent().get(`/api/invoices/${draft.body.id}`)
      expect(stillFinal.body.status).toBe('final')
    })

    it('record 16: deleting a draft leaves no redemption or link behind', async () => {
      await seedRate()
      const customer = await seedCustomer('Draft Delete Credit', '9876501123')
      const scheme = await createScheme({ name: 'Draft Delete Scheme', durationMonths: 2 })
      const accountId = await maturedAccount(customer.id, scheme.id)

      const draft = await createInvoiceWithScheme(customer.id, accountId, 2)
      expect(draft.status).toBe(201)

      const deleted = await getTestAgent().delete(`/api/invoices/${draft.body.id}`)
      expect(deleted.status).toBe(204)

      const detail = await getTestAgent().get(`/api/gold-savings/accounts/${accountId}`)
      expect(detail.body.redemptions).toHaveLength(0)
      expect(detail.body.account.status).toBe('matured')
      const linkCount = (
        getDatabase()
          .prepare('SELECT COUNT(*) AS count FROM invoice_gold_saving_links WHERE account_id = ?')
          .get(accountId) as { count: number }
      ).count
      expect(linkCount).toBe(0)
    })

    it('record 17: rejects another customer account and a doubly linked account', async () => {
      await seedRate()
      const customer = await seedCustomer('Link Guard', '9876501124')
      const scheme = await createScheme({ name: 'Link Guard Scheme', durationMonths: 2 })
      const accountId = await maturedAccount(customer.id, scheme.id)

      const otherCustomer = await seedCustomer('Other Holder', '9876501125')
      const otherEnrolled = await enrollAndPay(otherCustomer.id, scheme.id)
      expect(otherEnrolled.status).toBe(201)

      const foreign = await createInvoiceWithScheme(customer.id, otherEnrolled.body.account.id, 2)
      expect(foreign.status).toBe(400)
      expect(foreign.body.error).toMatch(/does not belong/)

      const first = await createInvoiceWithScheme(customer.id, accountId, 2)
      expect(first.status).toBe(201)

      const second = await createInvoiceWithScheme(customer.id, accountId, 2)
      expect(second.status).toBe(400)
      expect(second.body.error).toMatch(/already applied/)
    })

    it('record 18: caps the credit at the bill total when partial redemption is allowed', async () => {
      await seedRate()
      const customer = await seedCustomer('Partial Cap', '9876501126')
      const scheme = await createScheme({
        name: 'Partial Cap Scheme',
        durationMonths: 2,
        allowPartialRedemption: true,
        allowEarlyClosure: true,
      })
      const accountId = await maturedAccount(customer.id, scheme.id)

      // Line total 2000, scheme credit 4000: capped to 0.2 g and a zero payable.
      const draft = await createInvoiceWithScheme(customer.id, accountId, 0.4)
      expect(draft.status).toBe(201)
      expect(draft.body.subtotal).toBe(2000)
      expect(draft.body.amountPayable).toBe(0)
      expect(draft.body.goldSavingLinks[0].goldWeight).toBe(0.2)
      expect(draft.body.goldSavingLinks[0].amountApplied).toBe(2000)
    })
  })

  describe('phase 2: cancellation with a refund', () => {
    async function payInstallment(accountId: number, installmentId: number) {
      const paid = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId,
        installmentId,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(paid.status).toBe(201)
    }

    it('record 19: percentage deduction refunds the balance and zeroes the ledger', async () => {
      await seedRate()
      const customer = await seedCustomer('Refund Percentage', '9876501130')
      const scheme = await createScheme({
        name: 'Refund Percentage Scheme',
        durationMonths: 3,
        cancelDeductionType: 'percentage',
        cancelDeductionValue: 10,
      })
      const enrolled = await enrollAndPay(customer.id, scheme.id)
      expect(enrolled.status).toBe(201)
      await payInstallment(enrolled.body.account.id, installmentOf(enrolled.body, 2).id)

      const cancelled = await getTestAgent()
        .post(`/api/gold-savings/accounts/${enrolled.body.account.id}/cancel`)
        .send({
          reason: 'Customer relocated',
          refundDate: TODAY,
          paymentMode: 'bank_transfer',
          transactionRef: 'UTR-77',
        })
      expect(cancelled.status).toBe(200)
      expect(cancelled.body.account.status).toBe('cancelled')
      expect(cancelled.body.refund).toBeTruthy()
      expect(cancelled.body.refund.totalPaid).toBe(4000)
      expect(cancelled.body.refund.deduction).toBe(400)
      expect(cancelled.body.refund.refundAmount).toBe(3600)
      expect(cancelled.body.refund.goldForfeited).toBeCloseTo(0.4, 5)
      expect(cancelled.body.refund.paymentMode).toBe('bank_transfer')
      expect(cancelled.body.refund.transactionRef).toBe('UTR-77')
      expect(cancelled.body.refund.voucherNo).toMatch(/^GSRF-/)
      expect(cancelled.body.account.goldAccumulated).toBe(0)

      const refundEntry = cancelled.body.ledger[cancelled.body.ledger.length - 1]
      expect(refundEntry.entryType).toBe('refund')
      expect(refundEntry.cumulativeGold).toBe(0)

      const voucher = await getTestAgent().get(`/api/gold-savings/refunds/${cancelled.body.refund.id}`)
      expect(voucher.status).toBe(200)
      expect(voucher.body.voucherNo).toBe(cancelled.body.refund.voucherNo)
      expect(voucher.body.customerName).toBe('Refund Percentage')
      expect(voucher.body.refundAmount).toBe(3600)
      expect(stockMovementCount()).toBe(0)
    })

    it('record 20: applies a fixed deduction and lets an admin override it', async () => {
      await seedRate()
      const fixedScheme = await createScheme({
        name: 'Refund Fixed Scheme',
        durationMonths: 2,
        cancelDeductionType: 'fixed',
        cancelDeductionValue: 500,
      })

      const fixedCustomer = await seedCustomer('Refund Fixed', '9876501131')
      const fixedEnroll = await enrollAndPay(fixedCustomer.id, fixedScheme.id)
      const fixedCancel = await getTestAgent()
        .post(`/api/gold-savings/accounts/${fixedEnroll.body.account.id}/cancel`)
        .send({ reason: 'Fixed deduction' })
      expect(fixedCancel.status).toBe(200)
      expect(fixedCancel.body.refund.deduction).toBe(500)
      expect(fixedCancel.body.refund.refundAmount).toBe(1500)

      const overrideCustomer = await seedCustomer('Refund Override', '9876501132')
      const overrideEnroll = await enrollAndPay(overrideCustomer.id, fixedScheme.id)
      const overrideCancel = await getTestAgent()
        .post(`/api/gold-savings/accounts/${overrideEnroll.body.account.id}/cancel`)
        .send({ reason: 'Admin override', deductionOverride: 1000 })
      expect(overrideCancel.status).toBe(200)
      expect(overrideCancel.body.refund.deduction).toBe(1000)
      expect(overrideCancel.body.refund.refundAmount).toBe(1000)
    })

    it('record 21: denies cancellation and a deduction override to staff', async () => {
      await seedRate()
      const customer = await seedCustomer('Refund Staff', '9876501133')
      const scheme = await createScheme({
        name: 'Refund Staff Scheme',
        durationMonths: 2,
        cancelDeductionType: 'percentage',
        cancelDeductionValue: 5,
      })
      const enrolled = await enrollAndPay(customer.id, scheme.id)

      const staff = await getTestAgent().post('/api/users').send({
        username: 'gs-refund-staff',
        password: 'staff123',
        role: 'staff',
        features: ['gold_savings'],
      })
      expect(staff.status).toBe(201)
      await getTestAgent().post('/api/auth/logout')
      const login = await getTestAgent().post('/api/auth/login').send({
        username: 'gs-refund-staff',
        password: 'staff123',
      })
      expect(login.status).toBe(200)

      const denied = await getTestAgent()
        .post(`/api/gold-savings/accounts/${enrolled.body.account.id}/cancel`)
        .send({ reason: 'Staff attempt' })
      expect(denied.status).toBe(403)

      const deniedOverride = await getTestAgent()
        .post(`/api/gold-savings/accounts/${enrolled.body.account.id}/cancel`)
        .send({ reason: 'Staff override', deductionOverride: 0 })
      expect(deniedOverride.status).toBe(403)
    })

    it('record 22: blocks cancellation once a redemption exists', async () => {
      await seedRate()
      const customer = await seedCustomer('Refund Blocked', '9876501134')
      const scheme = await createScheme({
        name: 'Refund Blocked Scheme',
        durationMonths: 2,
        allowPartialRedemption: true,
        allowEarlyClosure: true,
      })
      const enrolled = await enrollAndPay(customer.id, scheme.id)
      expect(enrolled.status).toBe(201)
      await payInstallment(enrolled.body.account.id, installmentOf(enrolled.body, 2).id)

      const redeemed = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: enrolled.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
        goldWeight: 0.1,
      })
      expect(redeemed.status).toBe(201)

      const cancelled = await getTestAgent()
        .post(`/api/gold-savings/accounts/${enrolled.body.account.id}/cancel`)
        .send({ reason: 'Cannot cancel after redemption' })
      expect(cancelled.status).toBe(400)
      expect(cancelled.body.error).toMatch(/not allowed after a redemption/)
    })
  })

  describe('phase 3: waive installments and late-fee rules', () => {
    it('record 23: computes fixed and per-day late fees across the grace boundary', async () => {
      await seedRate()
      await seedRate('2026-09-11')
      const fixedCustomer = await seedCustomer('Late Fee Fixed', '9876501140')
      const fixedScheme = await createScheme({
        name: 'Late Fee Fixed Scheme',
        durationMonths: 2,
        gracePeriodDays: 5,
        lateFeeType: 'fixed',
        lateFeeValue: 250,
      })
      const fixedEnroll = await enrollAndPay(fixedCustomer.id, fixedScheme.id, TODAY, {
        firstInstallmentDate: '2026-09-01',
        paymentDate: '2026-09-30',
      })
      expect(fixedEnroll.status).toBe(201)
      expect(fixedEnroll.body.payments[0].dueDate).toBe('2026-09-01')
      expect(fixedEnroll.body.payments[0].lateFee).toBe(250)
      expect(fixedEnroll.body.payments[0].totalReceived).toBe(2250)

      const perDayCustomer = await seedCustomer('Late Fee Per Day', '9876501141')
      const perDayScheme = await createScheme({
        name: 'Late Fee Per Day Scheme',
        durationMonths: 2,
        gracePeriodDays: 0,
        lateFeeType: 'per_day',
        lateFeeValue: 10,
      })
      const perDayEnroll = await enrollAndPay(perDayCustomer.id, perDayScheme.id, TODAY, {
        firstInstallmentDate: '2026-09-01',
        skipInitialPayment: true,
      })
      const perDayPay = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: perDayEnroll.body.account.id,
        installmentId: installmentOf(perDayEnroll.body, 1).id,
        paymentDate: '2026-09-11',
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(perDayPay.status).toBe(201)
      expect(perDayPay.body.lateFee).toBe(100)
      expect(perDayPay.body.totalReceived).toBe(2100)
    })

    it('record 24: denies a staff late-fee reduction but lets an admin waive it', async () => {
      await seedRate()
      await seedRate('2026-09-11')
      const staffCustomer = await seedCustomer('Late Fee Staff', '9876501142')
      const scheme = await createScheme({
        name: 'Late Fee Staff Scheme',
        durationMonths: 2,
        gracePeriodDays: 0,
        lateFeeType: 'per_day',
        lateFeeValue: 10,
      })
      const staffEnroll = await enrollAndPay(staffCustomer.id, scheme.id, TODAY, {
        firstInstallmentDate: '2026-09-01',
        skipInitialPayment: true,
      })

      const staff = await getTestAgent().post('/api/users').send({
        username: 'gs-late-staff',
        password: 'staff123',
        role: 'staff',
        features: ['gold_savings'],
      })
      expect(staff.status).toBe(201)
      await getTestAgent().post('/api/auth/logout')
      const login = await getTestAgent().post('/api/auth/login').send({
        username: 'gs-late-staff',
        password: 'staff123',
      })
      expect(login.status).toBe(200)

      const denied = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: staffEnroll.body.account.id,
        installmentId: installmentOf(staffEnroll.body, 1).id,
        paymentDate: '2026-09-11',
        amount: 2000,
        lateFee: 0,
        paymentMode: 'cash',
      })
      expect(denied.status).toBe(400)
      expect(denied.body.error).toMatch(/Only administrators can reduce the late fee/)

      await getTestAgent().post('/api/auth/logout')
      await loginAsAdmin()

      const adminCustomer = await seedCustomer('Late Fee Admin', '9876501143')
      const adminEnroll = await enrollAndPay(adminCustomer.id, scheme.id, TODAY, {
        firstInstallmentDate: '2026-09-01',
        skipInitialPayment: true,
      })
      const waived = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: adminEnroll.body.account.id,
        installmentId: installmentOf(adminEnroll.body, 1).id,
        paymentDate: '2026-09-11',
        amount: 2000,
        lateFee: 0,
        paymentMode: 'cash',
      })
      expect(waived.status).toBe(201)
      expect(waived.body.lateFee).toBe(0)
    })

    it('record 25: a waived installment matures the account without a bonus', async () => {
      await seedRate()
      const customer = await seedCustomer('Waive Maturity', '9876501144')
      const scheme = await createScheme({
        name: 'Waive Maturity Scheme',
        durationMonths: 2,
        bonusType: 'additional_gold',
        bonusValue: 1,
      })
      const enrolled = await enrollAndPay(customer.id, scheme.id, TODAY, { skipInitialPayment: true })
      const first = installmentOf(enrolled.body, 1)
      const second = installmentOf(enrolled.body, 2)

      const paid = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: first.id,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(paid.status).toBe(201)

      const waived = await getTestAgent()
        .post(`/api/gold-savings/installments/${second.id}/waive`)
        .send({ reason: 'Goodwill waiver' })
      expect(waived.status).toBe(200)
      expect(waived.body.account.status).toBe('matured')
      expect(
        waived.body.installments.find((item: Installment) => item.installmentNo === 2).status,
      ).toBe('waived')
      expect(waived.body.audit.some((entry: { action: string }) => entry.action === 'waive')).toBe(true)

      const redeemed = await getTestAgent().post('/api/gold-savings/redemptions').send({
        accountId: enrolled.body.account.id,
        redemptionDate: TODAY,
        redemptionKind: 'gold',
      })
      expect(redeemed.status).toBe(201)
      expect(redeemed.body.bonusGoldWeight).toBe(0)
    })

    it('record 26: denies the waive action to staff', async () => {
      await seedRate()
      const customer = await seedCustomer('Waive Staff', '9876501145')
      const scheme = await createScheme({ name: 'Waive Staff Scheme', durationMonths: 2 })
      const enrolled = await enrollAndPay(customer.id, scheme.id, TODAY, { skipInitialPayment: true })
      const second = installmentOf(enrolled.body, 2)

      const staff = await getTestAgent().post('/api/users').send({
        username: 'gs-waive-staff',
        password: 'staff123',
        role: 'staff',
        features: ['gold_savings'],
      })
      expect(staff.status).toBe(201)
      await getTestAgent().post('/api/auth/logout')
      const login = await getTestAgent().post('/api/auth/login').send({
        username: 'gs-waive-staff',
        password: 'staff123',
      })
      expect(login.status).toBe(200)

      const denied = await getTestAgent()
        .post(`/api/gold-savings/installments/${second.id}/waive`)
        .send({ reason: 'Staff attempt' })
      expect(denied.status).toBe(403)
    })
  })

  describe('phase 4: rate safety', () => {
    it("record 27: a backdated payment uses that date's rate", async () => {
      await seedRate('2026-09-15', 8000)
      await seedRate()
      const customer = await seedCustomer('Rate Backdate', '9876501146')
      const scheme = await createScheme({ name: 'Rate Backdate Scheme', durationMonths: 2 })
      const enrolled = await enrollAndPay(customer.id, scheme.id, TODAY, {
        firstInstallmentDate: '2026-09-15',
        skipInitialPayment: true,
      })
      expect(enrolled.status).toBe(201)

      const rate = await getTestAgent().get('/api/gold-savings/rate?date=2026-09-15&purity=22K')
      expect(rate.status).toBe(200)
      expect(rate.body.rate).toBe(8000)
      expect(rate.body.effectiveDate).toBe('2026-09-15')
      expect(rate.body.matchesDate).toBe(true)

      const paid = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: installmentOf(enrolled.body, 1).id,
        paymentDate: '2026-09-15',
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(paid.status).toBe(201)
      expect(paid.body.goldRate).toBe(8000)
      expect(paid.body.goldWeight).toBe(0.25)
    })

    it('record 28: blocks a stale rate for staff and lets an admin confirm it', async () => {
      await seedRate('2026-09-01', 9000)
      await seedRate()
      const customer = await seedCustomer('Rate Stale', '9876501147')
      const scheme = await createScheme({ name: 'Rate Stale Scheme', durationMonths: 2 })
      const enrolled = await enrollAndPay(customer.id, scheme.id, TODAY, {
        firstInstallmentDate: '2026-09-01',
        skipInitialPayment: true,
      })
      expect(enrolled.status).toBe(201)
      const first = installmentOf(enrolled.body, 1)

      const staff = await getTestAgent().post('/api/users').send({
        username: 'gs-rate-staff',
        password: 'staff123',
        role: 'staff',
        features: ['gold_savings'],
      })
      expect(staff.status).toBe(201)
      await getTestAgent().post('/api/auth/logout')
      const login = await getTestAgent().post('/api/auth/login').send({
        username: 'gs-rate-staff',
        password: 'staff123',
      })
      expect(login.status).toBe(200)

      const blocked = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: first.id,
        paymentDate: '2026-09-11',
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(blocked.status).toBe(400)
      expect(blocked.body.error).toMatch(/ask an administrator to confirm it/)

      await getTestAgent().post('/api/auth/logout')
      await loginAsAdmin()

      const adminBlocked = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: first.id,
        paymentDate: '2026-09-11',
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(adminBlocked.status).toBe(400)
      expect(adminBlocked.body.error).toMatch(/Confirm the rate date/)

      const adminAccepted = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: first.id,
        paymentDate: '2026-09-11',
        amount: 2000,
        paymentMode: 'cash',
        acceptRateDate: true,
      })
      expect(adminAccepted.status).toBe(201)
      expect(adminAccepted.body.goldRate).toBe(9000)
    })
  })

  describe('phase 5: payment reminders and call list', () => {
    it('record 29: the overdue-aging report carries the mobile and the overdue count', async () => {
      await seedRate()
      const customer = await seedCustomer('Call List Ravi', '9876501149')
      const scheme = await createScheme({ name: 'Call List Scheme', durationMonths: 6 })
      const enrolled = await enrollAndPay(customer.id, scheme.id, TODAY)
      expect(enrolled.status).toBe(201)
      const accountNo = enrolled.body.account.accountNo as string

      // Enroll today pays installment 1. Backdate installments 2 and 3 so the
      // account has two overdue dues, independent of the wall clock.
      const unpaid = (enrolled.body.installments as Installment[]).filter(
        (row) => row.installmentNo === 2 || row.installmentNo === 3,
      )
      expect(unpaid).toHaveLength(2)
      const db = getDatabase()
      for (const row of unpaid) {
        db.prepare('UPDATE gold_saving_installments SET due_date = ? WHERE id = ?').run('2020-01-01', row.id)
      }

      const report = await getTestAgent().get('/api/gold-savings/reports/overdue-aging')
      expect(report.status).toBe(200)
      expect(report.body.columns).toContain('Mobile')
      expect(report.body.columns).toContain('Overdue count')

      const row = (report.body.rows as Array<Record<string, string | number>>).find(
        (entry) => entry.Account === accountNo,
      )
      expect(row).toBeTruthy()
      expect(row?.Mobile).toBe('9876501149')
      expect(Number(row?.['Overdue count'])).toBe(2)
      expect(row?.Bucket).toBe('30+ days')

      // The same report powers call-list search by mobile.
      const byMobile = await getTestAgent()
        .get('/api/gold-savings/reports/overdue-aging')
        .query({ q: '9876501149' })
      expect(byMobile.status).toBe(200)
      expect(
        (byMobile.body.rows as Array<Record<string, string | number>>).some((entry) => entry.Account === accountNo),
      ).toBe(true)
    })
  })

  describe('phase 6: counter collection speed', () => {
    it('record 30: collecting several installments shares one batch and one receipt', async () => {
      await seedRate()
      const customer = await seedCustomer('Batch Collector', '9876501150')
      const scheme = await createScheme({ name: 'Batch Scheme', durationMonths: 6 })
      const enrolled = await enrollAndPay(customer.id, scheme.id, TODAY, { skipInitialPayment: true })
      expect(enrolled.status).toBe(201)
      const accountId = enrolled.body.account.id as number

      // Make the first three installments overdue, then collect all three.
      const db = getDatabase()
      const firstThree = (enrolled.body.installments as Installment[]).filter(
        (row) => row.installmentNo <= 3,
      )
      for (const row of firstThree) {
        db.prepare('UPDATE gold_saving_installments SET due_date = ? WHERE id = ?').run('2020-01-01', row.id)
      }

      const paid = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId,
        installmentId: firstThree[0].id,
        installmentCount: 3,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
        idempotencyKey: 'batch-collect-1',
      })
      expect(paid.status).toBe(201)
      expect(paid.body.batchNo).toMatch(/^GSB-\d{4}-\d{4}$/)
      const batch = paid.body.batchPayments as Array<{ id: number; installmentNo: number }>
      expect(batch).toHaveLength(3)
      expect(batch.map((row) => row.installmentNo)).toEqual([1, 2, 3])

      // Three posted rows, one shared batch number.
      const rows = db
        .prepare(
          `SELECT id, installment_id, batch_no, status FROM gold_saving_payments
           WHERE account_id = ? ORDER BY id`,
        )
        .all(accountId) as Array<{ id: number; batch_no: string; status: string }>
      expect(rows).toHaveLength(3)
      expect(rows.every((row) => row.status === 'posted')).toBe(true)
      expect(new Set(rows.map((row) => row.batch_no))).toEqual(new Set([paid.body.batchNo]))

      const paidStatuses = db
        .prepare(
          `SELECT installment_no, status FROM gold_saving_installments
           WHERE account_id = ? ORDER BY installment_no`,
        )
        .all(accountId) as Array<{ installment_no: number; status: string }>
      expect(paidStatuses.slice(0, 3).map((row) => row.status)).toEqual(['paid', 'paid', 'paid'])
      expect(paidStatuses[3].status).not.toBe('paid')

      // A receipt fetched by any row of the batch lists all three.
      const middle = batch[1]
      const fetched = await getTestAgent().get(`/api/gold-savings/payments/${middle.id}`)
      expect(fetched.status).toBe(200)
      expect((fetched.body.batchPayments as unknown[]).length).toBe(3)

      // Reversing one row reopens only that installment.
      const reversed = await getTestAgent()
        .post(`/api/gold-savings/payments/${middle.id}/reverse`)
        .send({ reason: 'E2E batch reverse' })
      expect(reversed.status).toBe(200)
      const afterReverse = db
        .prepare(
          `SELECT installment_no, status FROM gold_saving_installments
           WHERE account_id = ? ORDER BY installment_no`,
        )
        .all(accountId) as Array<{ installment_no: number; status: string }>
      expect(afterReverse[0].status).toBe('paid')
      expect(afterReverse[1].status).toBe('due')
      expect(afterReverse[2].status).toBe('paid')
    })

    it('record 31: refuses to collect more installments than remain', async () => {
      await seedRate()
      const customer = await seedCustomer('Batch Limit', '9876501151')
      const scheme = await createScheme({ name: 'Batch Limit Scheme', durationMonths: 2 })
      const enrolled = await enrollAndPay(customer.id, scheme.id, TODAY, { skipInitialPayment: true })
      expect(enrolled.status).toBe(201)

      const tooMany = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: installmentOf(enrolled.body, 1).id,
        installmentCount: 5,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(tooMany.status).toBe(400)
      expect(tooMany.body.error).toMatch(/installment\(s\) remain/)

      const single = await getTestAgent().post('/api/gold-savings/payments').send({
        accountId: enrolled.body.account.id,
        installmentId: installmentOf(enrolled.body, 1).id,
        installmentCount: 1,
        paymentDate: TODAY,
        amount: 2000,
        paymentMode: 'cash',
      })
      expect(single.status).toBe(201)
      expect(single.body.batchNo).toBe('')
      expect(single.body.batchPayments).toBeUndefined()
    })
  })
})
