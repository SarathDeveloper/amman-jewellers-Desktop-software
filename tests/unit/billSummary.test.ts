import { describe, expect, it } from 'vitest'
import {
  computeBillSummary,
  computeOldGoldValue,
  computePurchaseTotals,
  paymentStatusFor,
  resolveAmountPayable,
  suggestPurchaseRoundOff,
  suggestRoundOff,
} from '../../shared/billing/billSummary'

describe('bill summary', () => {
  it('computes old gold value with deduction', () => {
    expect(computeOldGoldValue({ netWeight: 10, ratePerGram: 6000, deductionPct: 10 })).toEqual({
      grossValue: 60000,
      deductionAmount: 6000,
      finalValue: 54000,
      fineWeight: 10,
    })
  })

  it('values on the fine weight when a touch percentage is set', () => {
    expect(
      computeOldGoldValue({ netWeight: 10, ratePerGram: 6000, deductionPct: 0, touchPct: 75 }),
    ).toEqual({
      grossValue: 45000,
      deductionAmount: 0,
      finalValue: 45000,
      fineWeight: 7.5,
    })
    // Touch and deduction stack: value the fine weight, then take the deduction.
    expect(
      computeOldGoldValue({ netWeight: 10, ratePerGram: 6000, deductionPct: 10, touchPct: 75 }),
    ).toEqual({
      grossValue: 45000,
      deductionAmount: 4500,
      finalValue: 40500,
      fineWeight: 7.5,
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

  it('applies discount after GST without changing taxable or tax', () => {
    const withDiscount = computeBillSummary({
      lineSubtotals: [10000],
      discount: 500,
      autoTax: true,
      roundOff: 0,
    })
    const withoutDiscount = computeBillSummary({
      lineSubtotals: [10000],
      discount: 0,
      autoTax: true,
      roundOff: 0,
    })
    expect(withDiscount.taxable).toBe(10000)
    expect(withDiscount.tax).toBe(withoutDiscount.tax)
    expect(withDiscount.cgst).toBe(withoutDiscount.cgst)
    expect(withDiscount.sgst).toBe(withoutDiscount.sgst)
    expect(withDiscount.invoiceTotal).toBe(10300)
    expect(withDiscount.discount).toBe(500)
    expect(withDiscount.amountBeforeRoundOff).toBe(9800)
    expect(withDiscount.amountPayable).toBe(9800)
  })

  it('does not change GST when round off changes', () => {
    const base = computeBillSummary({
      lineSubtotals: [10000],
      discount: 500,
      autoTax: true,
      roundOff: 0,
    })
    const rounded = computeBillSummary({
      lineSubtotals: [10000],
      discount: 500,
      autoTax: true,
      roundOff: -0.5,
    })
    expect(rounded.taxable).toBe(base.taxable)
    expect(rounded.tax).toBe(base.tax)
    expect(rounded.cgst).toBe(base.cgst)
    expect(rounded.amountPayable).toBe(9799.5)
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

  it('suggests a round off that always reduces the sale bill', () => {
    expect(suggestRoundOff(1234.6)).toBe(-0.6)
    expect(suggestRoundOff(1234.4)).toBe(-0.4)
    expect(suggestRoundOff(1234.5)).toBe(-0.5)
    expect(suggestRoundOff(22000.5)).toBe(-0.5)
    expect(suggestRoundOff(54790.85)).toBe(-0.85)
    expect(suggestRoundOff(100)).toBe(0)
    expect(suggestPurchaseRoundOff(1234.6)).toBe(0.4)
    expect(suggestPurchaseRoundOff(1234.4)).toBe(-0.4)
    expect(suggestPurchaseRoundOff(1234.5)).toBe(-0.5)
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

  it('computes purchase subtotal and applies nearest-rupee round off without tax', () => {
    const even = computePurchaseTotals([600])
    expect(even.subtotal).toBe(600)
    expect(even.tax).toBe(0)
    expect(even.cgst).toBe(0)
    expect(even.sgst).toBe(0)
    expect(even.roundOff).toBe(0)
    expect(even.total).toBe(600)

    const rounded = computePurchaseTotals([100.33])
    expect(rounded.subtotal).toBe(100.33)
    expect(rounded.tax).toBe(0)
    expect(rounded.cgst).toBe(0)
    expect(rounded.sgst).toBe(0)
    expect(rounded.roundOff).toBe(-0.33)
    expect(rounded.total).toBe(100)

    const forced = computePurchaseTotals([600], 0)
    expect(forced.roundOff).toBe(0)
    expect(forced.total).toBe(600)

    const roundedUp = computePurchaseTotals([10.6])
    expect(roundedUp.roundOff).toBe(0.4)
    expect(roundedUp.total).toBe(11)
  })

  it('takes the discount off the taxable value before GST', () => {
    const totals = computePurchaseTotals([10000, 5000], 0, {
      discount: 3000,
      gstMode: 'none',
    })
    expect(totals.subtotal).toBe(15000)
    expect(totals.discount).toBe(3000)
    expect(totals.taxable).toBe(12000)
    expect(totals.tax).toBe(0)
    expect(totals.total).toBe(12000)
  })

  it('splits 3% GST into CGST and SGST for an intra-state purchase', () => {
    const totals = computePurchaseTotals([10000], 0, { discount: 1000, gstMode: 'intra' })
    expect(totals.taxable).toBe(9000)
    expect(totals.cgst).toBe(135)
    expect(totals.sgst).toBe(135)
    expect(totals.igst).toBe(0)
    expect(totals.tax).toBe(270)
    expect(totals.total).toBe(9270)
  })

  it('puts the whole 3% on IGST for an inter-state purchase', () => {
    const totals = computePurchaseTotals([10000], 0, { discount: 1000, gstMode: 'inter' })
    expect(totals.cgst).toBe(0)
    expect(totals.sgst).toBe(0)
    expect(totals.igst).toBe(270)
    expect(totals.tax).toBe(270)
    expect(totals.total).toBe(9270)
  })

  it('never discounts below zero', () => {
    const totals = computePurchaseTotals([100], 0, { discount: 500, gstMode: 'intra' })
    expect(totals.discount).toBe(100)
    expect(totals.taxable).toBe(0)
    expect(totals.tax).toBe(0)
    expect(totals.total).toBe(0)
  })
})
