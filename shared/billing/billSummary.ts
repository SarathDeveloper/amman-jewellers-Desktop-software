import type { OldGoldItemInput } from '../types'
import { computeInvoiceTax, computeInvoiceTotals, roundMoney } from './pricing'

export interface OldGoldValueInput {
  netWeight: number
  ratePerGram: number
  deductionPct?: number
}

export interface OldGoldValueResult {
  grossValue: number
  deductionAmount: number
  finalValue: number
}

export function computeOldGoldValue(input: OldGoldValueInput): OldGoldValueResult {
  const netWeight = Math.max(0, input.netWeight)
  const ratePerGram = Math.max(0, input.ratePerGram)
  const deductionPct = Math.min(100, Math.max(0, input.deductionPct ?? 0))
  const grossValue = roundMoney(netWeight * ratePerGram)
  const deductionAmount = roundMoney((grossValue * deductionPct) / 100)
  const finalValue = roundMoney(Math.max(0, grossValue - deductionAmount))
  return { grossValue, deductionAmount, finalValue }
}

export function suggestRoundOff(amountBeforeRoundOff: number): number {
  return roundMoney(Math.round(amountBeforeRoundOff) - amountBeforeRoundOff)
}

export interface PurchaseTotalsResult {
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  tax: number
  roundOff: number
  total: number
}

export function computePurchaseTotals(
  lineAmounts: number[],
  roundOff?: number,
  useIgst = false,
): PurchaseTotalsResult {
  const subtotal = roundMoney(lineAmounts.reduce((sum, value) => sum + value, 0))
  const taxBreakdown = computeInvoiceTax(subtotal, useIgst)
  const amountBeforeRoundOff = roundMoney(subtotal + taxBreakdown.tax)
  const appliedRoundOff = roundOff ?? suggestRoundOff(amountBeforeRoundOff)
  return {
    subtotal,
    cgst: taxBreakdown.cgst,
    sgst: taxBreakdown.sgst,
    igst: taxBreakdown.igst,
    tax: taxBreakdown.tax,
    roundOff: appliedRoundOff,
    total: roundMoney(amountBeforeRoundOff + appliedRoundOff),
  }
}

export function resolveAmountPayable(amountPayable: number | null | undefined, total: number): number {
  return amountPayable == null || Number.isNaN(amountPayable) ? total : amountPayable
}

export function paymentStatusFor(
  amountPayable: number,
  amountPaid: number,
  /** Invoice total before old-gold / round-off. Used to tell empty drafts from settled ₹0 payable bills. */
  invoiceTotal = 0,
): 'paid' | 'partial' | 'unpaid' {
  const payable = roundMoney(Math.max(0, amountPayable))
  const paid = roundMoney(Math.max(0, amountPaid))
  const billed = roundMoney(Math.max(0, invoiceTotal))
  // Empty / zero bill: nothing billed and nothing owed — not "paid"
  if (payable <= 0) return billed > 0 ? 'paid' : 'unpaid'
  if (paid >= payable) return 'paid'
  if (paid > 0) return 'partial'
  return 'unpaid'
}

export interface BillSummaryInput {
  lineSubtotals: number[]
  discount: number
  autoTax: boolean
  useIgst?: boolean
  manualTax?: number
  oldGold?: Array<Pick<OldGoldItemInput, 'netWeight' | 'ratePerGram' | 'deductionPct'> & { finalValue?: number }>
  extraOldGoldCredit?: number
  roundOff?: number
}

export interface BillSummary {
  subtotal: number
  discount: number
  taxable: number
  cgst: number
  sgst: number
  igst: number
  tax: number
  invoiceTotal: number
  total: number
  oldGoldTotal: number
  amountBeforeRoundOff: number
  roundOff: number
  amountPayable: number
}

export function computeBillSummary(input: BillSummaryInput): BillSummary {
  const totals = computeInvoiceTotals(
    input.lineSubtotals,
    input.discount,
    input.autoTax,
    input.useIgst ?? false,
    input.manualTax ?? 0,
  )
  const oldGoldFromItems = (input.oldGold ?? []).reduce((sum, item) => {
    if (item.finalValue != null && Number.isFinite(item.finalValue)) {
      return sum + Math.max(0, item.finalValue)
    }
    return sum + computeOldGoldValue({
      netWeight: item.netWeight,
      ratePerGram: item.ratePerGram,
      deductionPct: item.deductionPct,
    }).finalValue
  }, 0)
  const oldGoldTotal = roundMoney(oldGoldFromItems + Math.max(0, input.extraOldGoldCredit ?? 0))
  const amountBeforeRoundOff = roundMoney(totals.total - oldGoldTotal)
  const roundOff = roundMoney(input.roundOff ?? 0)
  const amountPayable = roundMoney(amountBeforeRoundOff + roundOff)

  return {
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxable: roundMoney(Math.max(0, totals.subtotal - totals.discount)),
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    tax: totals.tax,
    invoiceTotal: totals.total,
    total: totals.total,
    oldGoldTotal,
    amountBeforeRoundOff,
    roundOff,
    amountPayable,
  }
}
