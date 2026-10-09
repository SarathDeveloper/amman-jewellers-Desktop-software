import type { Product } from '../types'

export const DEFAULT_HSN = '7113'
export const INTRA_STATE_GST_RATE = 0.03

export interface LinePricingInput {
  qty: number
  metalRate: number
  grossWeight: number
  netWeight: number
  stoneWeight: number
  makingCharges: number
  wastagePct: number
  stoneRate: number
  otherCharges: number
  hsnCode?: string
}

export interface LinePricingResult {
  lineSubtotal: number
  lineTotal: number
  hsnCode: string
}

export function defaultHsnForProduct(product: Product): string {
  return DEFAULT_HSN
}

export type MetalRateSnapshot = {
  gold22k: number
  gold24k: number
  gold20k: number
  gold18k: number
  silverFine: number
  silver925: number
}

export function resolveMetalRate(metal: string, purity: string, rates: MetalRateSnapshot): number {
  const metalValue = metal.toLowerCase()
  const purityValue = purity.toLowerCase()
  if (metalValue.includes('silver')) {
    if (purityValue.includes('925')) return rates.silver925
    return rates.silverFine
  }
  if (purityValue.includes('24')) return rates.gold24k
  if (purityValue.includes('20')) return rates.gold20k
  if (purityValue.includes('18')) return rates.gold18k
  if (purityValue.includes('22') || metalValue.includes('gold')) return rates.gold22k
  if (purityValue.includes('925')) return rates.silver925
  if (purityValue.includes('silver') || purityValue.includes('999')) return rates.silverFine
  return rates.silverFine
}

export function resolveMetalRateForProduct(product: Product, rates: MetalRateSnapshot): number {
  return resolveMetalRate(product.metal, product.purity, rates)
}

export function linePricingFromProduct(
  product: Product,
  qty: number,
  metalRate: number,
  overrides?: Partial<LinePricingInput>,
): LinePricingInput {
  return {
    qty,
    metalRate,
    grossWeight: overrides?.grossWeight ?? product.grossWeight,
    netWeight: overrides?.netWeight ?? product.netWeight,
    stoneWeight: overrides?.stoneWeight ?? product.stoneWeight,
    makingCharges: overrides?.makingCharges ?? product.makingCharges,
    wastagePct: overrides?.wastagePct ?? 0,
    stoneRate: overrides?.stoneRate ?? 0,
    otherCharges: overrides?.otherCharges ?? 0,
    hsnCode: overrides?.hsnCode ?? defaultHsnForProduct(product),
  }
}

export interface PurchaseLineAmountInput {
  qty: number
  netWeight: number
  rate: number
  makingCharges?: number
}

export function computePurchaseLineAmount(input: PurchaseLineAmountInput): number {
  const qty = Math.max(0, input.qty)
  const metalValue = input.netWeight * qty * input.rate
  const makingValue = (input.makingCharges ?? 0) * qty
  return roundMoney(metalValue + makingValue)
}

export function computeLinePricing(input: LinePricingInput): LinePricingResult {
  const qty = input.qty
  const wastageMultiplier = 1 + input.wastagePct / 100
  const netMetal = input.netWeight * qty * wastageMultiplier
  const metalValue = netMetal * input.metalRate
  const makingValue = input.makingCharges * qty
  const stoneValue = input.stoneWeight * qty * input.stoneRate
  const otherValue = (input.otherCharges ?? 0) * qty
  const lineSubtotal = roundMoney(metalValue + makingValue + stoneValue + otherValue)

  return {
    lineSubtotal,
    lineTotal: lineSubtotal,
    hsnCode: input.hsnCode ?? DEFAULT_HSN,
  }
}

export function computeInvoiceTax(subtotalAfterDiscount: number, useIgst = false): {
  cgst: number
  sgst: number
  igst: number
  tax: number
} {
  const tax = roundMoney(subtotalAfterDiscount * INTRA_STATE_GST_RATE)
  if (useIgst) {
    return { cgst: 0, sgst: 0, igst: tax, tax }
  }
  const half = roundMoney(tax / 2)
  const other = roundMoney(tax - half)
  return { cgst: half, sgst: other, igst: 0, tax }
}

export function computeInvoiceTotals(
  lineSubtotals: number[],
  discount: number,
  autoTax: boolean,
  useIgst = false,
  manualTax = 0,
): {
  subtotal: number
  discount: number
  cgst: number
  sgst: number
  igst: number
  tax: number
  total: number
} {
  const subtotal = roundMoney(lineSubtotals.reduce((sum, value) => sum + value, 0))
  const discountApplied = roundMoney(Math.min(discount, Math.max(0, subtotal)))
  const taxable = roundMoney(Math.max(0, subtotal - discountApplied))
  const taxBreakdown = autoTax
    ? computeInvoiceTax(taxable, useIgst)
    : { cgst: 0, sgst: 0, igst: 0, tax: roundMoney(manualTax) }
  const total = roundMoney(taxable + taxBreakdown.tax)

  return {
    subtotal,
    discount: discountApplied,
    cgst: taxBreakdown.cgst,
    sgst: taxBreakdown.sgst,
    igst: taxBreakdown.igst,
    tax: taxBreakdown.tax,
    total,
  }
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function roundWeight(value: number): number {
  return Math.round(value * 1000) / 1000
}
