import { describe, expect, it } from 'vitest'
import {
  computeBillSummary,
  computeOldGoldValue,
  computePurchaseTotals,
  paymentStatusFor,
  resolveAmountPayable,
  suggestRoundOff,
} from '../../shared/billing/billSummary'

describe('bill summary', () => {
  it('computes old gold value with deduction', () => {
    expect(computeOldGoldValue({ netWeight: 10, ratePerGram: 6000, deductionPct: 10 })).toEqual({
      grossValue: 60000,
      deductionAmount: 6000,
      finalValue: 54000,
    })
  })

  it('subtracts old gold after invoice total and applies signed round off', () => {
    const summary = computeBillSummary({
      lineSubtotals: [10000],
      discount: 0,
      autoTax: true,
      oldGold: [{ netWeight: 1, ratePerGram: 1000, deductionPct: 0 }],
      roundOff: -0.3,
    })
    expect(summary.invoiceTotal).toBe(10300)
    expect(summary.oldGoldTotal).toBe(1000)
    expect(summary.amountBeforeRoundOff).toBe(9300)
    expect(summary.amountPayable).toBe(9299.7)
  })

  it('adds linked old gold credit on top of stored old gold rows', () => {
    const summary = computeBillSummary({
      lineSubtotals: [60000],
      discount: 0,
      autoTax: false,
      oldGold: [{ netWeight: 1, ratePerGram: 1000, deductionPct: 0 }],
      extraOldGoldCredit: 45000,
      roundOff: 0,
    })
    expect(summary.oldGoldTotal).toBe(46000)
    expect(summary.amountPayable).toBe(14000)
  })

  it('suggests nearest-rupee round off and payment status', () => {
    expect(suggestRoundOff(1234.6)).toBe(0.4)
    expect(suggestRoundOff(1234.4)).toBe(-0.4)
    expect(paymentStatusFor(1000, 1000, 1000)).toBe('paid')
    expect(paymentStatusFor(1000, 400, 1000)).toBe('partial')
    expect(paymentStatusFor(1000, 0, 1000)).toBe('unpaid')
    // Empty draft (nothing billed, nothing owed) is unpaid — not paid
    expect(paymentStatusFor(0, 0, 0)).toBe('unpaid')
    // Settled via old gold / credit (billed > 0, payable 0) remains paid
    expect(paymentStatusFor(0, 0, 5000)).toBe('paid')
  })

  it('keeps a zero amount payable instead of falling back to invoice total', () => {
    expect(resolveAmountPayable(0, 10300)).toBe(0)
    expect(resolveAmountPayable(null, 10300)).toBe(10300)
  })

  it('splits 3% purchase GST and applies nearest-rupee round off', () => {
    const even = computePurchaseTotals([600])
    expect(even.subtotal).toBe(600)
    expect(even.tax).toBe(18)
    expect(even.cgst).toBe(9)
    expect(even.sgst).toBe(9)
    expect(even.roundOff).toBe(0)
    expect(even.total).toBe(618)

    const rounded = computePurchaseTotals([100.33])
    expect(rounded.tax).toBe(3.01)
    expect(rounded.cgst).toBe(1.51)
    expect(rounded.sgst).toBe(1.5)
    expect(rounded.roundOff).toBe(-0.34)
    expect(rounded.total).toBe(103)

    const forced = computePurchaseTotals([600], 0)
    expect(forced.roundOff).toBe(0)
    expect(forced.total).toBe(618)
  })
})
