import { computeBillSummary, type BillSummaryInput } from '@shared/billing/billSummary'
import {
  computeLinePricing,
  resolveMetalRate,
  resolveMetalRateForProduct,
  roundMoney,
} from '@shared/billing/pricing'
import { GOLD_PURITIES, huidRemovalRange, SILVER_PURITIES } from '@shared/itemTypes'
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
import { sellableProducts, variantDisplayName } from '../products/productDisplay'

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
  /** Hallmark Unique ID picked for this piece (only for tagged products). */
  huid: string
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
  const base: string[] = value.includes('silver')
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
    huid: '',
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
    huid: '',
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
    purity: item.purity || inferSalePurity(item.metal, product?.purity),
    huid: item.huid ?? '',
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
  huid?: string,
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
    huid: (huid ?? '').trim().toUpperCase(),
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
  schemeCredit = 0,
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
    schemeCredit,
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
        purity: line.purity,
        huid: (line.productId ?? 0) > 0 && line.huid.trim() ? line.huid.trim().toUpperCase() : undefined,
      }
    })
}

export function productForLine(line: EditorLine, products: Product[]): Product | null {
  if (!line.productId) return null
  return products.find((product) => product.id === line.productId) ?? null
}

/** HUIDs already claimed by the other lines of the same bill. */
export function huidsUsedByOtherLines(lines: EditorLine[], exceptKey: string): Set<string> {
  const used = new Set<string>()
  for (const line of lines) {
    if (line.key === exceptKey) continue
    const value = line.huid.trim().toUpperCase()
    if (value) used.add(value)
  }
  return used
}

/** HUIDs a line may pick: the product's tagged HUIDs, minus ones used on other lines. */
export function availableHuidsForLine(
  line: EditorLine,
  products: Product[],
  lines: EditorLine[],
): string[] {
  const product = productForLine(line, products)
  if (!product) return []
  const used = huidsUsedByOtherLines(lines, line.key)
  const selected = line.huid.trim().toUpperCase()
  return (product.huids ?? []).filter((huid) => !used.has(huid) || huid === selected)
}

/** True when a single-piece sale line has a saved product, so a HUID can be recorded for it. */
export function lineOffersHuid(line: EditorLine, products: Product[]): boolean {
  if (line.lineKind === 'exchange' || isEmptyEditorLine(line)) return false
  if (numericFieldToNumber(line.qty, 1) !== 1) return false
  return productForLine(line, products) != null
}

/** True when the line must pick a tagged HUID: every piece in stock is already tagged. */
export function lineNeedsHuid(line: EditorLine, products: Product[]): boolean {
  if (!lineOffersHuid(line, products)) return false
  const product = productForLine(line, products)
  if (!product) return false
  return huidRemovalRange((product.huids ?? []).length, product.stockQty, 1).min > 0
}

/**
 * Why the HUID typed on `line` is not acceptable, or null when it is fine.
 * The owner may type any 6-character HUID that no other product or live piece uses.
 */
export function lineHuidError(line: EditorLine, products: Product[], lines: EditorLine[]): string | null {
  const huid = line.huid.trim().toUpperCase()
  if (!huid) return null
  if (!/^[0-9A-Z]+$/.test(huid)) return 'HUID can only be letters and digits'
  if (huidsUsedByOtherLines(lines, line.key).has(huid)) return `HUID ${huid} is used twice on this bill`
  if (lineNeedsHuid(line, products) && !availableHuidsForLine(line, products, lines).includes(huid)) {
    return `HUID ${huid} is not tagged on this product`
  }
  return null
}

/** Product lines whose HUID is invalid, or missing where a tag is required. */
export function linesWithHuidError(
  lines: EditorLine[],
  products: Product[],
): Array<{ line: EditorLine; error: string }> {
  const rows: Array<{ line: EditorLine; error: string }> = []
  for (const line of lines) {
    const error = lineHuidError(line, products, lines)
    if (error) {
      rows.push({ line, error })
    } else if (lineNeedsHuid(line, products) && !line.huid.trim()) {
      rows.push({ line, error: 'Select a HUID for this tagged item' })
    }
  }
  return rows
}

/**
 * The sellable product that has `huid` tagged, unless another line of this bill
 * already claims it. Mirrors the exact-match HUID lookup in `BillProductSearch`.
 */
export function productForHuid(
  huid: string,
  products: Product[],
  lines: EditorLine[],
  exceptKey = '',
): Product | null {
  const code = huid.trim().toUpperCase()
  if (code.length === 0) return null
  if (huidsUsedByOtherLines(lines, exceptKey).has(code)) return null
  return (
    sellableProducts(products).find((product) =>
      (product.huids ?? []).some((tag) => tag.toUpperCase() === code),
    ) ?? null
  )
}

export type HuidCellState = {
  state: 'empty' | 'product' | 'disabled'
  /** Why the cell is disabled, shown as a tooltip. */
  reason?: string
}

/**
 * How the HUID cell should render on a row: an enabled scan field on the empty
 * row, the tagged-HUID picker on a matching product line, and a disabled field
 * everywhere else.
 */
export function huidCellState(line: EditorLine, products: Product[]): HuidCellState {
  if (isEmptyEditorLine(line)) return { state: 'empty' }
  if (lineOffersHuid(line, products)) return { state: 'product' }
  if (!productForLine(line, products)) {
    return { state: 'disabled', reason: 'HUID needs a catalog item' }
  }
  return { state: 'disabled', reason: 'One HUID per line' }
}

/** Pieces of each product asked for by the bill, counting every line. */
export function qtyByProduct(lines: EditorLine[]): Record<number, number> {
  const totals: Record<number, number> = {}
  for (const line of lines) {
    const productId = line.productId ?? 0
    if (!productId || isEmptyEditorLine(line)) continue
    totals[productId] = (totals[productId] ?? 0) + numericFieldToNumber(line.qty)
  }
  return totals
}

export type StockShortage = {
  key: string
  productId: number
  productName: string
  /** Pieces asked for once this line is included. */
  requested: number
  available: number
}

/**
 * Lines that ask for more pieces than the product has in stock. Lines are walked
 * in bill order so the first line that pushes a product past its stock is the one
 * flagged. Mirrors the server's `Insufficient stock` failure at finalize.
 */
export function stockShortages(lines: EditorLine[], products: Product[]): StockShortage[] {
  const stock = new Map(products.map((row) => [row.id, row.stockQty]))
  const used = new Map<number, number>()
  const shortages: StockShortage[] = []
  for (const line of lines) {
    const productId = line.productId ?? 0
    if (!productId || isEmptyEditorLine(line)) continue
    const requested = (used.get(productId) ?? 0) + numericFieldToNumber(line.qty)
    used.set(productId, requested)
    const available = stock.get(productId) ?? 0
    if (requested > available) {
      shortages.push({
        key: line.key,
        productId,
        productName: line.description.trim() || 'this product',
        requested,
        available,
      })
    }
  }
  return shortages
}

/** The message the editor and the server both use when a line beats stock. */
export function stockShortageMessage(shortage: StockShortage): string {
  return `Insufficient stock for ${shortage.productName} (${shortage.available} available, ${shortage.requested} on this bill)`
}

/** `3 in stock` / `Out of stock` for a product search option. */
export function stockAvailabilityLabel(stockQty: number, usedQty = 0): string {
  if (stockQty <= 0) return 'Out of stock'
  const remaining = stockQty - usedQty
  if (remaining <= 0) return `All ${stockQty} on this bill`
  return `${remaining} in stock`
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
  touchPct: NumericField
}

/** Old gold buying rate for a purity, falling back to the selling rate when unset. */
export function rateForOldGoldPurity(purity: string, rates: MetalRates | null): number {
  if (!rates) return 0
  const value = purity.toLowerCase()
  const sell = (buy: number | undefined, selling: number) => ((buy ?? 0) > 0 ? buy! : selling)
  if (value.includes('925')) return sell(rates.silver925Buy, rates.silver925)
  if (value.includes('999') || value.includes('silver')) return sell(rates.silverFineBuy, rates.silverFine)
  if (value.includes('24')) return sell(rates.gold24kBuy, rates.gold24k)
  if (value.includes('20')) return sell(rates.gold20kBuy, rates.gold20k)
  if (value.includes('18')) return sell(rates.gold18kBuy, rates.gold18k)
  return sell(rates.gold22kBuy, rates.gold22k)
}

export function metalForOldGoldPurity(purity: string): 'Gold' | 'Silver' {
  const value = purity.toLowerCase()
  return value.includes('925') || value.includes('silver') || value.includes('999') ? 'Silver' : 'Gold'
}

export function newOldGoldRow(
  rates: MetalRates | null = null,
  description = 'Old gold exchange',
): OldGoldEditorRow {
  return {
    key: crypto.randomUUID(),
    description,
    grossWeight: '',
    stoneWeight: '',
    netWeight: '',
    purity: '22K',
    ratePerGram: rateForOldGoldPurity('22K', rates) || '',
    deductionPct: '',
    touchPct: '',
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
    touchPct: '',
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
        touchPct: numericFieldToNumber(row.touchPct),
        metal: metalForOldGoldPurity(row.purity),
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
