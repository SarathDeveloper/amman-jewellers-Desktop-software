import { computeBillSummary, type BillSummaryInput } from '@shared/billing/billSummary'
import {
  computeLinePricing,
  resolveMetalRate,
  resolveMetalRateForProduct,
  roundMoney,
} from '@shared/billing/pricing'
import { GOLD_PURITIES, SILVER_PURITIES } from '@shared/itemTypes'
import type {
  InvoiceItem,
  InvoiceItemInput,
  InvoiceLineKind,
  MetalRates,
  OldGoldItem,
  OldGoldItemInput,
  Product,
} from '@shared/types'
import { numericFieldToNumber, type NumericField } from '../../lib/numericField'
import { variantDisplayName } from '../products/productDisplay'

type EditorLineNumericKey = 'qty' | 'rate' | 'netWeight' | 'metalRate' | 'makingCharges' | 'otherCharges'

export type VamcMode = 'pct' | 'amount'

export type EditorLine = Omit<InvoiceItemInput, EditorLineNumericKey> & {
  key: string
  qty: NumericField
  rate: NumericField
  netWeight?: NumericField
  metalRate?: NumericField
  makingCharges?: NumericField
  otherCharges?: NumericField
  vamcMode: VamcMode
  lineKind: InvoiceLineKind
  description: string
  metal?: string
  category?: string
  purity?: string
  productId: number | null
  /** True until the cashier types a rate. Empty lines then follow today's metal rate. */
  metalRateAuto?: boolean
}

export function exclusiveVamc(line: Pick<EditorLine, 'vamcMode' | 'wastagePct' | 'makingCharges'>): {
  mode: VamcMode
  wastagePct: number
  makingCharges: number
} {
  const mode: VamcMode = line.vamcMode === 'amount' ? 'amount' : 'pct'
  if (mode === 'amount') {
    return { mode, wastagePct: 0, makingCharges: numericFieldToNumber(line.makingCharges) }
  }
  return { mode, wastagePct: numericFieldToNumber(line.wastagePct), makingCharges: 0 }
}

export function vamcValue(line: EditorLine): number {
  const vamc = exclusiveVamc(line)
  return vamc.mode === 'amount' ? vamc.makingCharges : vamc.wastagePct
}

export function vamcPatch(
  line: EditorLine,
  next: { mode?: VamcMode; value?: number },
): Partial<EditorLine> {
  const switching = next.mode !== undefined && next.mode !== line.vamcMode
  const mode = next.mode ?? exclusiveVamc(line).mode
  const value = switching ? 0 : (next.value ?? vamcValue(line))
  if (mode === 'amount') {
    return { vamcMode: 'amount', wastagePct: 0, makingCharges: value }
  }
  return { vamcMode: 'pct', wastagePct: value, makingCharges: 0 }
}

export const SALE_PURITIES = [...GOLD_PURITIES, ...SILVER_PURITIES] as const

export function inferSalePurity(metal?: string, productPurity?: string): string {
  if (productPurity?.trim()) return productPurity.trim()
  if (metal?.toLowerCase().includes('silver')) return SILVER_PURITIES[0]
  return '22K'
}

export function puritiesForMetal(metal?: string, purity?: string): string[] {
  const value = metal?.toLowerCase() ?? ''
  const base = value.includes('silver')
    ? [...SILVER_PURITIES]
    : value.includes('gold')
      ? [...GOLD_PURITIES]
      : [...SALE_PURITIES]
  if (purity && !base.includes(purity)) return [purity, ...base]
  return base
}

export function rateForSalePurity(purity: string, rates: MetalRates | null, metal?: string): number {
  if (!rates) return 0
  const purityValue = purity.toLowerCase()
  const inferredMetal = metal?.trim()
    ? metal
    : purityValue.includes('925') || purityValue.includes('silver')
      ? 'Silver'
      : 'Gold'
  return resolveMetalRate(inferredMetal, purity, {
    gold22k: rates.gold22k,
    gold24k: rates.gold24k,
    gold20k: rates.gold20k,
    gold18k: rates.gold18k,
    silverFine: rates.silverFine,
    silver925: rates.silver925,
  })
}

export function isEmptyEditorLine(line: EditorLine): boolean {
  return !(line.productId ?? 0) && !line.description.trim()
}

export function isActiveEditorLine(line: EditorLine): boolean {
  return (line.productId ?? 0) > 0 || Boolean(line.description.trim())
}

export function ensureTrailingEmptyLine(lines: EditorLine[]): EditorLine[] {
  if (lines.some(isEmptyEditorLine)) return lines
  return [...lines, newEditorLine()]
}

export function newEditorLine(): EditorLine {
  return {
    key: crypto.randomUUID(),
    productId: 0,
    qty: 1,
    rate: '',
    grossWeight: 0,
    netWeight: '',
    stoneWeight: 0,
    metalRate: '',
    makingCharges: '',
    wastagePct: 0,
    stoneRate: 0,
    otherCharges: '',
    vamcMode: 'pct',
    lineKind: 'sale',
    description: '',
    purity: '',
  }
}

export function newExchangeLine(metalRates: MetalRates | null): EditorLine {
  const rate = metalRates?.gold22k ?? 0
  return {
    key: crypto.randomUUID(),
    productId: null,
    qty: 1,
    rate,
    grossWeight: 0,
    netWeight: '',
    stoneWeight: 0,
    metalRate: rate,
    makingCharges: 0,
    wastagePct: 0,
    stoneRate: 0,
    otherCharges: 0,
    vamcMode: 'pct',
    lineKind: 'exchange',
    description: 'Old gold exchange',
    metal: 'Gold',
    category: '',
    purity: '22K',
  }
}

export function editorLineFromInvoiceItem(item: InvoiceItem, product?: Product | null): EditorLine {
  return {
    key: String(item.id),
    productId: item.productId,
    qty: item.qty,
    rate: item.rate,
    grossWeight: item.grossWeight,
    netWeight: item.netWeight,
    stoneWeight: item.stoneWeight,
    metalRate: item.metalRate,
    makingCharges: (item.makingCharges ?? 0) > 0 ? item.makingCharges : 0,
    wastagePct: (item.makingCharges ?? 0) > 0 ? 0 : item.wastagePct,
    stoneRate: item.stoneRate,
    otherCharges: item.otherCharges ?? 0,
    vamcMode: (item.makingCharges ?? 0) > 0 ? 'amount' : 'pct',
    hsnCode: item.hsnCode,
    lineKind: item.lineKind ?? 'sale',
    description: item.description || item.productName,
    metal: item.metal,
    category: item.category,
    purity: inferSalePurity(item.metal, product?.purity),
    metalRateAuto: !(item.metalRate > 0),
  }
}

export function applyCurrentMetalRate(line: EditorLine, metalRates: MetalRates | null): EditorLine {
  if (!line.metalRateAuto || isEmptyEditorLine(line) || line.lineKind === 'exchange') return line
  const purity = line.purity || inferSalePurity(line.metal)
  const nextRate = rateForSalePurity(purity, metalRates, line.metal)
  if (!nextRate) return line
  if (
    numericFieldToNumber(line.metalRate ?? line.rate) === nextRate &&
    numericFieldToNumber(line.rate) === nextRate
  ) {
    return line
  }
  return { ...line, metalRate: nextRate, rate: nextRate }
}

export function applyProductToLine(
  product: Product,
  qty: number,
  metalRates: MetalRates | null,
): Partial<EditorLine> {
  const snapshot = {
    gold22k: metalRates?.gold22k ?? 0,
    gold24k: metalRates?.gold24k ?? 0,
    gold20k: metalRates?.gold20k ?? 0,
    gold18k: metalRates?.gold18k ?? 0,
    silverFine: metalRates?.silverFine ?? 0,
    silver925: metalRates?.silver925 ?? 0,
  }
  const metalRate = resolveMetalRateForProduct(product, snapshot)

  return {
    productId: product.id,
    qty,
    grossWeight: product.grossWeight,
    netWeight: product.netWeight,
    metalRate,
    rate: metalRate,
    stoneWeight: product.stoneWeight,
    stoneRate: 0,
    otherCharges: 0,
    ...(product.makingCharges > 0
      ? { vamcMode: 'amount' as const, makingCharges: product.makingCharges, wastagePct: 0 }
      : { vamcMode: 'pct' as const, makingCharges: 0, wastagePct: 0 }),
    lineKind: 'sale',
    description: variantDisplayName(product),
    metal: product.metal,
    category: product.category,
    purity: product.purity,
    metalRateAuto: true,
  }
}

export function computeEditorLineTotal(line: EditorLine): number {
  const qty = numericFieldToNumber(line.qty, 1)
  const netWeight = numericFieldToNumber(line.netWeight)
  const metalRate = numericFieldToNumber(line.metalRate ?? line.rate)

  if (line.lineKind === 'exchange') {
    return -roundMoney(netWeight * qty * metalRate)
  }

  const { makingCharges, wastagePct } = exclusiveVamc(line)
  const otherCharges = numericFieldToNumber(line.otherCharges)
  const priced = computeLinePricing({
    qty,
    metalRate,
    grossWeight: line.grossWeight ?? 0,
    netWeight,
    stoneWeight: line.stoneWeight ?? 0,
    makingCharges,
    wastagePct,
    stoneRate: line.stoneRate ?? 0,
    otherCharges,
    hsnCode: line.hsnCode,
  })
  return priced.lineTotal
}

export function computeEditorTotals(
  lines: EditorLine[],
  discount: number,
  autoTax: boolean,
  useIgst: boolean,
  manualTax: number,
  oldGold: BillSummaryInput['oldGold'] = [],
  roundOff = 0,
  extraOldGoldCredit = 0,
) {
  const active = lines.filter(
    (line) =>
      (line.lineKind === 'exchange' && numericFieldToNumber(line.netWeight) > 0) ||
      (line.lineKind !== 'exchange' && isActiveEditorLine(line)),
  )
  const saleLines = active.filter((line) => line.lineKind !== 'exchange')
  const exchangeLines = active.filter((line) => line.lineKind === 'exchange')
  const saleSubtotal = saleLines.reduce((sum, line) => sum + computeEditorLineTotal(line), 0)
  const exchangeCredit = exchangeLines.reduce((sum, line) => sum + Math.abs(computeEditorLineTotal(line)), 0)
  const summary = computeBillSummary({
    lineSubtotals: saleLines.map((line) => computeEditorLineTotal(line)),
    discount,
    autoTax,
    useIgst,
    manualTax,
    oldGold,
    extraOldGoldCredit: exchangeCredit + Math.max(0, extraOldGoldCredit),
    roundOff,
  })

  return {
    ...summary,
    saleSubtotal: roundMoney(saleSubtotal),
    exchangeCredit: roundMoney(exchangeCredit),
  }
}

export function computeSaleBreakdown(lines: EditorLine[]) {
  let jewelleryValue = 0
  let wastageAmount = 0
  let makingCharges = 0
  let otherCharges = 0
  let itemCount = 0
  let totalGrossWeight = 0
  for (const line of lines) {
    if (line.lineKind === 'exchange' || !isActiveEditorLine(line)) continue
    itemCount += 1
    const qty = numericFieldToNumber(line.qty, 1)
    const net = numericFieldToNumber(line.netWeight)
    const rate = numericFieldToNumber(line.metalRate ?? line.rate)
    const { makingCharges: making, wastagePct } = exclusiveVamc(line)
    const metalValue = net * qty * rate
    jewelleryValue += metalValue
    wastageAmount += metalValue * (wastagePct / 100)
    makingCharges += making * qty
    otherCharges += numericFieldToNumber(line.otherCharges) * qty
    totalGrossWeight += (line.grossWeight ?? 0) * qty
  }
  return {
    jewelleryValue: roundMoney(jewelleryValue),
    wastageAmount: roundMoney(wastageAmount),
    makingCharges: roundMoney(makingCharges),
    otherCharges: roundMoney(otherCharges),
    itemCount,
    totalGrossWeight: Math.round(totalGrossWeight * 1000) / 1000,
  }
}

export function toInvoiceItems(lines: EditorLine[]): InvoiceItemInput[] {
  return lines
    .filter((line) => {
      if (line.lineKind === 'exchange') {
        return numericFieldToNumber(line.netWeight) > 0
      }
      return isActiveEditorLine(line)
    })
    .map((line) => {
      if (line.lineKind === 'exchange') {
        return {
          productId: null,
          qty: numericFieldToNumber(line.qty, 1),
          rate: numericFieldToNumber(line.metalRate ?? line.rate),
          grossWeight: line.grossWeight ?? numericFieldToNumber(line.netWeight),
          netWeight: numericFieldToNumber(line.netWeight),
          stoneWeight: 0,
          metalRate: numericFieldToNumber(line.metalRate ?? line.rate),
          makingCharges: 0,
          wastagePct: 0,
          stoneRate: 0,
          otherCharges: 0,
          hsnCode: line.hsnCode,
          lineKind: 'exchange' as const,
          description: line.description || 'Old gold exchange',
          metal: line.metal || 'Gold',
          category: line.category || '',
        }
      }
      const vamc = exclusiveVamc(line)
      return {
        productId: (line.productId ?? 0) > 0 ? line.productId : null,
        qty: numericFieldToNumber(line.qty, 1),
        rate: numericFieldToNumber(line.metalRate ?? line.rate),
        grossWeight: line.grossWeight,
        netWeight: numericFieldToNumber(line.netWeight),
        stoneWeight: line.stoneWeight,
        metalRate: numericFieldToNumber(line.metalRate ?? line.rate),
        makingCharges: vamc.makingCharges,
        wastagePct: vamc.wastagePct,
        stoneRate: line.stoneRate,
        otherCharges: numericFieldToNumber(line.otherCharges),
        hsnCode: line.hsnCode,
        lineKind: 'sale' as const,
        description: line.description,
        metal: line.metal,
        category: line.category,
      }
    })
}

export const OLD_GOLD_PURITIES = ['24K', '22K', '20K', '18K', '999', '925'] as const

export function oldGoldPurityOptions(current: string): string[] {
  const base = [...OLD_GOLD_PURITIES]
  if (current && !base.includes(current as (typeof OLD_GOLD_PURITIES)[number])) {
    return [current, ...base]
  }
  return base
}

export type OldGoldEditorRow = {
  key: string
  description: string
  grossWeight: NumericField
  stoneWeight: NumericField
  netWeight: NumericField
  purity: string
  ratePerGram: NumericField
  deductionPct: NumericField
}

export function rateForOldGoldPurity(purity: string, rates: MetalRates | null): number {
  const value = purity.toLowerCase()
  if (value.includes('925')) return rates?.silver925 ?? 0
  if (value.includes('999') || value.includes('silver')) return rates?.silverFine ?? 0
  if (value.includes('24')) return rates?.gold24k ?? 0
  if (value.includes('20')) return rates?.gold20k ?? 0
  if (value.includes('18')) return rates?.gold18k ?? 0
  return rates?.gold22k ?? 0
}

export function newOldGoldRow(rates: MetalRates | null = null): OldGoldEditorRow {
  return {
    key: crypto.randomUUID(),
    description: 'Old gold exchange',
    grossWeight: '',
    stoneWeight: '',
    netWeight: '',
    purity: '22K',
    ratePerGram: rates?.gold22k ?? '',
    deductionPct: '',
  }
}

export function oldGoldRowFromItem(item: OldGoldItem): OldGoldEditorRow {
  return {
    key: String(item.id),
    description: item.description,
    grossWeight: item.grossWeight || '',
    stoneWeight: item.stoneWeight || '',
    netWeight: item.netWeight || '',
    purity: item.purity || '22K',
    ratePerGram: item.ratePerGram || '',
    deductionPct: item.deductionPct || '',
  }
}

export function toOldGoldInputs(rows: OldGoldEditorRow[]): OldGoldItemInput[] {
  return rows
    .map((row) => {
      const grossWeight = numericFieldToNumber(row.grossWeight)
      const stoneWeight = numericFieldToNumber(row.stoneWeight)
      const netWeight =
        numericFieldToNumber(row.netWeight) || Math.max(0, grossWeight - stoneWeight)
      return {
        description: row.description.trim() || 'Old gold exchange',
        grossWeight,
        stoneWeight,
        netWeight,
        purity: row.purity,
        ratePerGram: numericFieldToNumber(row.ratePerGram),
        deductionPct: numericFieldToNumber(row.deductionPct),
      }
    })
    .filter((item) => item.grossWeight > 0 && item.netWeight > 0)
}

export function heldBillsStorageKey(format: 'cash_bill' | 'tax_invoice'): string {
  return `jeweltrackerpro.heldBills.${format}`
}

export function readHeldBillIds(format: 'cash_bill' | 'tax_invoice'): number[] {
  try {
    const raw = sessionStorage.getItem(heldBillsStorageKey(format))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is number => typeof id === 'number' && id > 0)
  } catch {
    return []
  }
}

export function rememberHeldBill(format: 'cash_bill' | 'tax_invoice', id: number): void {
  const ids = [...new Set([id, ...readHeldBillIds(format)])].slice(0, 20)
  sessionStorage.setItem(heldBillsStorageKey(format), JSON.stringify(ids))
}

export function forgetHeldBill(format: 'cash_bill' | 'tax_invoice', id: number): void {
  const ids = readHeldBillIds(format).filter((value) => value !== id)
  sessionStorage.setItem(heldBillsStorageKey(format), JSON.stringify(ids))
}
