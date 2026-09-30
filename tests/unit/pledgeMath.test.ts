import { describe, expect, it } from 'vitest'
import {
  clampRepaymentDueDate,
  computePledgeInterest,
  daysBetween,
  defaultRepaymentDueDate,
  formatAdgReceiptNo,
  maxRepaymentDueDate,
  netPaidAmount,
  nextInterestDueDate,
  parseAdgSeq,
  suggestedLoanAmount,
  pledgeAmountDue,
  monthlyPledgeInterestAmount,
  totalPayableAfterOneYear,
  totalPrincipalWithTopups,
  pledgeAmountDueWithTopups,
  isInterestPeriodDue,
} from '../../shared/billing/pledgeMath'

describe('pledgeMath', () => {
  it('computes simple interest and suggested loan', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30)
    expect(computePledgeInterest(20000, 1.5, '2026-08-01', '2026-08-31')).toBe(300)
    expect(suggestedLoanAmount(40000, 75)).toBe(30000)
    expect(nextInterestDueDate('2026-08-01', '2026-08-15')).toBe('2026-08-31')
    const due = pledgeAmountDue(20000, 1.5, '2026-08-01', '2026-08-31', 5000)
    expect(due.interest).toBe(300)
    expect(due.totalDue).toBe(20300)
    expect(due.remaining).toBe(15300)
  })

  it('computes net paid and default repayment due', () => {
    expect(netPaidAmount(15000, 300)).toBe(14700)
    expect(netPaidAmount(1000, 1500)).toBe(0)
    expect(defaultRepaymentDueDate('2026-09-26')).toBe('2027-09-26')
  })

  it('computes monthly and one-year summary amounts', () => {
    expect(monthlyPledgeInterestAmount(100000, 2.1)).toBe(2100)
    expect(totalPayableAfterOneYear(100000, 2.1, '2026-09-26')).toBe(125550)
  })

  it('adds top-up principal and interest from the top-up date only', () => {
    expect(totalPrincipalWithTopups(10000, [{ amount: 2500 }])).toBe(12500)
    expect(isInterestPeriodDue('2026-08-01', '2026-08-30')).toBe(false)
    expect(isInterestPeriodDue('2026-08-01', '2026-08-31')).toBe(true)
    const due = pledgeAmountDueWithTopups(
      10000,
      [{ amount: 5000, topupDate: '2026-08-31', interestPct: 2 }],
      2,
      '2026-08-01',
      '2026-08-31',
      0,
    )
    expect(due.principal).toBe(15000)
    expect(due.interest).toBe(200)
    expect(due.monthlyInterest).toBe(300)
    expect(due.totalDue).toBe(15200)
  })

  it('formats ADG receipt numbers and clamps due dates', () => {
    expect(formatAdgReceiptNo(1)).toBe('ADG0001')
    expect(formatAdgReceiptNo(12)).toBe('ADG0012')
    expect(formatAdgReceiptNo(10000)).toBe('ADG10000')
    expect(parseAdgSeq('ADG0001')).toBe(1)
    expect(parseAdgSeq('AD-2026-0001')).toBeNull()
    expect(maxRepaymentDueDate('2026-09-26')).toBe('2027-09-26')
    expect(clampRepaymentDueDate('2026-08-01', '2026-09-26')).toBe('2026-09-26')
    expect(clampRepaymentDueDate('2028-01-01', '2026-09-26')).toBe('2027-09-26')
    expect(clampRepaymentDueDate('2026-12-01', '2026-09-26')).toBe('2026-12-01')
  })
})
