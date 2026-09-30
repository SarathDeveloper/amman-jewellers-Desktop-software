import { computeBillSummary } from '@shared/billing/billSummary'
import {
  computeLinePricing,
  DEFAULT_HSN,
  linePricingFromProduct,
  resolveMetalRateForProduct,
  roundMoney,
} from '@shared/billing/pricing'
import type { InvoiceItemInput, InvoiceLineKind, MetalRates, OldGoldItemInput, Product } from '@shared/types'

export interface ComputedLine {
  input: InvoiceItemInput
  lineKind: InvoiceLineKind
  description: string
  lineSubtotal: number
  lineTotal: number
  lineTax: number
  metalRate: number
  grossWeight: number
  netWeight: number
  stoneWeight: number
  makingCharges: number
  wastagePct: number
  stoneRate: number
  otherCharges: number
  hsnCode: string
  rate: number
  metal: string
  category: string
  productId: number | null
}

export function getLatestRatesSnapshot(
  rates: MetalRates | null,
): {
  gold22k: number
  gold24k: number
  gold20k: number
  gold18k: number
  silverFine: number
  silver925: number
} {
  return {
    gold22k: rates?.gold22k ?? 0,
    gold24k: rates?.gold24k ?? 0,
    gold20k: rates?.gold20k ?? 0,
    gold18k: rates?.gold18k ?? 0,
    silverFine: rates?.silverFine ?? 0,
    silver925: rates?.silver925 ?? 0,
  }
}

function resolveExchangeMetalRate(
  metal: string,
  purity: string,
  rates: {
    gold22k: number
    gold24k: number
    gold20k: number
    gold18k: number
    silverFine: number
    silver925: number
  },
  override?: number,
): number {
  if (override != null && override > 0) return override
  const metalLower = metal.toLowerCase()
  const purityLower = purity.toLowerCase()
  if (metalLower.includes('silver') || purityLower.includes('925')) {
    if (purityLower.includes('925')) return rates.silver925
    return rates.silverFine
  }
  if (purityLower.includes('24')) return rates.gold24k
  if (purityLower.includes('20')) return rates.gold20k
  if (purityLower.includes('18')) return rates.gold18k
  if (purityLower.includes('22') || metalLower.includes('gold')) return rates.gold22k
  return rates.gold22k
}

export function computeInvoiceLines(
  items: InvoiceItemInput[],
  productsById: Map<number, Product>,
  rates: MetalRates | null,
): ComputedLine[] {
  const rateSnapshot = getLatestRatesSnapshot(rates)

  return items.map((item) => {
    const lineKind: InvoiceLineKind = item.lineKind ?? 'sale'

    if (lineKind === 'exchange') {
      const qty = item.qty > 0 ? item.qty : 1
      const netWeight = item.netWeight ?? 0
      const metal = item.metal?.trim() || 'Gold'
      const metalRate = resolveExchangeMetalRate(
        metal,
        item.description ?? '',
        rateSnapshot,
        item.metalRate ?? (item.rate > 0 ? item.rate : undefined),
      )
      const credit = roundMoney(netWeight * qty * metalRate)
      const description =
        item.description?.trim() ||
        `Old ${metal} exchange${item.category ? ` (${item.category})` : ''}`

      return {
        input: item,
        lineKind,
        description,
        lineSubtotal: -credit,
        lineTotal: -credit,
        lineTax: 0,
        metalRate,
        grossWeight: item.grossWeight ?? netWeight,
        netWeight,
        stoneWeight: 0,
        makingCharges: 0,
        wastagePct: 0,
        stoneRate: 0,
        otherCharges: 0,
        hsnCode: item.hsnCode ?? DEFAULT_HSN,
        rate: metalRate,
        metal,
        category: item.category?.trim() || '',
        productId: null,
      }
    }

    const productId = item.productId
    if (productId == null || productId <= 0) {
      throw new Error('Sale lines require a product')
    }
    const product = productsById.get(productId)
    if (!product) {
      throw new Error(`Product ${productId} not found`)
    }

    const metalRate =
      item.metalRate ??
      (item.rate > 0 ? item.rate : resolveMetalRateForProduct(product, rateSnapshot))

    const pricingInput = linePricingFromProduct(product, item.qty, metalRate, {
      grossWeight: item.grossWeight,
      netWeight: item.netWeight,
      stoneWeight: item.stoneWeight,
      makingCharges: item.makingCharges,
      wastagePct: item.wastagePct,
      stoneRate: item.stoneRate,
      otherCharges: item.otherCharges,
      hsnCode: item.hsnCode,
    })

    const priced = computeLinePricing(pricingInput)

    return {
      input: item,
      lineKind,
      description: item.description?.trim() || product.name,
      lineSubtotal: priced.lineSubtotal,
      lineTotal: priced.lineTotal,
      lineTax: 0,
      metalRate: pricingInput.metalRate,
      grossWeight: pricingInput.grossWeight,
      netWeight: pricingInput.netWeight,
      stoneWeight: pricingInput.stoneWeight,
      makingCharges: pricingInput.makingCharges,
      wastagePct: pricingInput.wastagePct,
      stoneRate: pricingInput.stoneRate,
      otherCharges: pricingInput.otherCharges,
      hsnCode: priced.hsnCode,
      rate: pricingInput.metalRate,
      metal: product.metal,
      category: product.category,
      productId,
    }
  })
}

export function computeInvoiceAmounts(
  lines: ComputedLine[],
  options: {
    discount: number
    autoTax: boolean
    useIgst: boolean
    manualTax: number
    amountPaid: number
    oldGold?: OldGoldItemInput[]
    extraOldGoldCredit?: number
    roundOff?: number
  },
) {
  const saleSubtotals = lines
    .filter((line) => line.lineKind !== 'exchange')
    .map((line) => line.lineSubtotal)
  const exchangeCredit = lines
    .filter((line) => line.lineKind === 'exchange')
    .reduce((sum, line) => sum + Math.abs(line.lineSubtotal), 0)

  const summary = computeBillSummary({
    lineSubtotals: saleSubtotals,
    discount: options.discount,
    autoTax: options.autoTax,
    useIgst: options.useIgst,
    manualTax: options.manualTax,
    oldGold: options.oldGold ?? [],
    extraOldGoldCredit: exchangeCredit + Math.max(0, options.extraOldGoldCredit ?? 0),
    roundOff: options.roundOff ?? 0,
  })

  const totals = {
    subtotal: summary.subtotal,
    discount: summary.discount,
    cgst: summary.cgst,
    sgst: summary.sgst,
    igst: summary.igst,
    tax: summary.tax,
    total: summary.invoiceTotal,
  }
  const paid = roundMoney(Math.max(0, options.amountPaid))
  const balanceDue = roundMoney(Math.max(0, summary.amountPayable - paid))

  return { totals, summary, balanceDue }
}
