import type { OldGoldItemInput, PurchaseGstMode } from '../types'
import { computeInvoiceTotals, INTRA_STATE_GST_RATE, roundMoney, roundWeight } from './pricing'

export interface OldGoldValueInput {
  netWeight: number
  ratePerGram: number
  deductionPct?: number
  /** Touch / assay percentage. When above 0 the value uses the fine weight. */
  touchPct?: number
}

export interface OldGoldValueResult {
  grossValue: number
  deductionAmount: number
  finalValue: number
  /** Weight the value is based on: `netWeight * touch / 100` when touch is set. */
  fineWeight: number
}

export function computeOldGoldValue(input: OldGoldValueInput): OldGoldValueResult {
  const netWeight = Math.max(0, input.netWeight)
  const ratePerGram = Math.max(0, input.ratePerGram)
  const deductionPct = Math.min(100, Math.max(0, input.deductionPct ?? 0))
  const touchPct = input.touchPct != null && input.touchPct > 0 ? Math.min(100, input.touchPct) : 0
  const valuedWeight = touchPct > 0 ? (netWeight * touchPct) / 100 : netWeight
  const grossValue = roundMoney(valuedWeight * ratePerGram)
  const deductionAmount = roundMoney((grossValue * deductionPct) / 100)
  const finalValue = roundMoney(Math.max(0, grossValue - deductionAmount))
  return { grossValue, deductionAmount, finalValue, fineWeight: roundWeight(valuedWeight) }
}

/** Sale bills always drop the paise. 54790.85 becomes −0.85, never +0.15. */
export function suggestRoundOff(amountBeforeRoundOff: number): number {
  const amount = roundMoney(amountBeforeRoundOff)
  return roundMoney(Math.floor(amount) - amount)
}

/** Purchase invoices round to the nearest rupee. Half a rupee still reduces the total. */
export function suggestPurchaseRoundOff(amountBeforeRoundOff: number): number {
  const amount = roundMoney(amountBeforeRoundOff)
  const fraction = roundMoney(amount - Math.trunc(amount))
  if (Math.abs(fraction) === 0.5) {
    return roundMoney(Math.floor(amount) - amount)
  }
  return roundMoney(Math.round(amount) - amount)
}

export interface PurchaseTotalsResult {
  subtotal: number
  discount: number
  taxable: number
  cgst: number
  sgst: number
  igst: number
  tax: number
  roundOff: number
  total: number
}

/** How GST is recorded on a supplier purchase. Mirrors `inwards.gst_mode`. */
export interface PurchaseTotalsOptions {
  discount?: number
  gstMode?: PurchaseGstMode
}

export function computePurchaseTotals(
  lineAmounts: number[],
  roundOff?: number,
  options: PurchaseTotalsOptions = {},
): PurchaseTotalsResult {
  const subtotal = roundMoney(lineAmounts.reduce((sum, value) => sum + value, 0))
  const discount = roundMoney(Math.min(Math.max(0, options.discount ?? 0), Math.max(0, subtotal)))
  const taxable = roundMoney(Math.max(0, subtotal - discount))
  const gstMode: PurchaseGstMode = options.gstMode ?? 'none'
  // Jewellery is 3% (HSN 7113): CGST + SGST intra-state, IGST inter-state.
  const tax = gstMode === 'none' ? 0 : roundMoney(taxable * INTRA_STATE_GST_RATE)
  const cgst = gstMode === 'intra' ? roundMoney(tax / 2) : 0
  const sgst = gstMode === 'intra' ? roundMoney(tax - cgst) : 0
  const igst = gstMode === 'inter' ? tax : 0
  const amountBeforeRoundOff = roundMoney(taxable + tax)
  const appliedRoundOff = roundOff ?? suggestPurchaseRoundOff(amountBeforeRoundOff)
  return {
    subtotal,
    discount,
    taxable,
    cgst,
    sgst,
    igst,
    tax,
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
  /** Gold savings scheme credit, valued in rupees. Kept separate from old gold. */
  schemeCredit?: number
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
  schemeCreditTotal: number
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
  const schemeCreditTotal = roundMoney(Math.max(0, input.schemeCredit ?? 0))
  // Discount comes after GST and credits — it must not change the tax base.
  const maxDiscount = roundMoney(Math.max(0, totals.total - oldGoldTotal - schemeCreditTotal))
  const discount = roundMoney(Math.min(totals.discount, maxDiscount))
  const amountBeforeRoundOff = roundMoney(totals.total - oldGoldTotal - schemeCreditTotal - discount)
  const roundOff = roundMoney(input.roundOff ?? 0)
  const amountPayable = roundMoney(amountBeforeRoundOff + roundOff)

  return {
    subtotal: totals.subtotal,
    discount,
    taxable: totals.subtotal,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    tax: totals.tax,
    invoiceTotal: totals.total,
    total: totals.total,
    oldGoldTotal,
    schemeCreditTotal,
    amountBeforeRoundOff,
    roundOff,
    amountPayable,
  }
}
