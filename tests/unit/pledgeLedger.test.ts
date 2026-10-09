import { describe, expect, it } from 'vitest'
import {
  interestMonths,
  partMonthMonths,
  replayPledge,
} from '../../shared/billing/pledgeLedger'

const base = { amount: 10000, rate: 2, date: '2026-01-01' }

describe('pledgeLedger period rules', () => {
  it('charges a minimum of one month for the first period', () => {
    expect(interestMonths(0, true)).toBe(1)
    expect(interestMonths(1, true)).toBe(1)
    expect(interestMonths(30, true)).toBe(1)
    expect(interestMonths(45, true)).toBe(1.5)
    expect(interestMonths(46, true)).toBe(2)
  })

  it('rounds later part-months to half or full', () => {
    expect(partMonthMonths(0)).toBe(0)
    expect(partMonthMonths(15)).toBe(0.5)
    expect(partMonthMonths(16)).toBe(1)
    expect(partMonthMonths(29)).toBe(1)
    expect(partMonthMonths(30)).toBe(1)
    expect(partMonthMonths(61)).toBe(2.5)
    expect(interestMonths(15, false)).toBe(0.5)
    expect(interestMonths(46, false)).toBe(2)
  })
})

describe('replayPledge', () => {
  it('charges one month when the loan is closed the same day', () => {
    const result = replayPledge({ base, asOfDate: '2026-01-01' })
    expect(result.currentInterest).toBe(200)
    expect(result.interestDue).toBe(200)
    expect(result.payoff).toBe(10200)
  })

  it('charges one month on day one', () => {
    const result = replayPledge({ base, asOfDate: '2026-01-02' })
    expect(result.currentInterest).toBe(200)
    expect(result.payoff).toBe(10200)
  })

  it('charges one and a half months at 45 days', () => {
    expect(replayPledge({ base, asOfDate: '2026-02-15' }).currentInterest).toBe(300)
    expect(replayPledge({ base, asOfDate: '2026-02-16' }).currentInterest).toBe(400)
  })

  it('holds a partial interest payment as credit without closing the period', () => {
    const result = replayPledge({
      base,
      asOfDate: '2026-01-31',
      payments: [{ date: '2026-01-31', amount: 100 }],
    })
    expect(result.interestCredit).toBe(100)
    expect(result.interestDue).toBe(100)
    expect(result.assessedInterest).toBe(0)
    expect(result.payoff).toBe(10100)
    expect(result.allocations[0].interestPart).toBe(100)
  })

  it('reduces later interest when the principal is repaid', () => {
    const result = replayPledge({
      base,
      asOfDate: '2026-03-02',
      payments: [{ date: '2026-01-31', amount: 5100 }],
    })
    expect(result.principalOutstanding).toBe(5100)
    expect(result.assessedInterest).toBe(200)
    expect(result.currentInterest).toBe(102)
    expect(result.payoff).toBe(5202)
  })

  it('accrues interest on each top-up from its own date', () => {
    const result = replayPledge({
      base,
      topups: [{ amount: 5000, rate: 2, date: '2026-02-01' }],
      asOfDate: '2026-03-01',
    })
    expect(result.currentInterest).toBe(500)
    expect(result.principalOutstanding).toBe(15000)
    expect(result.monthlyInterest).toBe(300)
    expect(result.payoff).toBe(15500)
  })

  it('applies a discount to interest before principal', () => {
    const result = replayPledge({
      base,
      asOfDate: '2026-01-31',
      payments: [{ date: '2026-01-31', amount: 100, discount: 100 }],
    })
    expect(result.totalDiscount).toBe(100)
    expect(result.payoff).toBe(10000)
    expect(result.grossDue).toBe(10100)
  })

  it('settles the loan exactly when the payoff is paid', () => {
    const result = replayPledge({
      base,
      asOfDate: '2026-01-31',
      payments: [{ date: '2026-01-31', amount: 10200 }],
    })
    expect(result.principalOutstanding).toBe(0)
    expect(result.payoff).toBe(0)
    expect(result.grossDue).toBe(10200)
  })

  it('allows interest to be paid in advance', () => {
    const result = replayPledge({
      base,
      asOfDate: '2026-01-20',
      payments: [
        { date: '2026-01-05', amount: 200 },
        { date: '2026-01-20', amount: 10000 },
      ],
    })
    expect(result.currentInterest).toBe(0)
    expect(result.principalOutstanding).toBe(0)
    expect(result.grossDue).toBe(10200)
  })

  it('keeps the gross due equal to the money collected once settled', () => {
    const collected = 10200
    const result = replayPledge({
      base,
      asOfDate: '2026-01-31',
      payments: [{ date: '2026-01-31', amount: collected }],
    })
    expect(result.grossDue).toBe(collected)
  })
})
