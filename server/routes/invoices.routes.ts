import { Router, type Request } from 'express'
import {
  historicalInvoiceInputSchema,
  invoiceCancelInputSchema,
  invoiceInputSchema,
  invoicePaymentInputSchema,
  invoiceUpdateInputSchema,
} from '@shared/schemas'
import { computeOldGoldValue, resolveAmountPayable } from '@shared/billing/billSummary'
import {
  isDraftInvoiceNo,
  isEstimateInvoiceNo,
  isProvisionalInvoiceNo,
} from '@shared/billing/invoiceNumber'
import { computeInvoiceTax, roundMoney } from '@shared/billing/pricing'
import { huidRemovalRange } from '@shared/itemTypes'
import { localTodayIso } from '@shared/localDate'
import type {
  BillCustomerInfo,
  BillFormat,
  HistoricalInvoiceInput,
  Invoice,
  InvoiceCancelInput,
  InvoiceInput,
  InvoiceItem,
  InvoiceLineKind,
  InvoicePayment,
  InvoicePaymentInput,
  InvoiceUpdateInput,
  MetalRates,
  MixedPaymentPart,
  OldGoldItem,
  OldGoldItemInput,
  OldGoldPurchaseLink,
  OldGoldPurchaseLinkInput,
  PaymentMode,
  TaxReportRow,
} from '@shared/types'
import { computeInvoiceAmounts, computeInvoiceLines } from '../billing/invoiceCompute'
import { getDatabase } from '../db'
import { assertMetalsOpenForDate } from '../db/metalDayClosing'
import { syncDueEntryForFinalInvoice } from '../dues/invoiceSync'
import {
  finalizeGoldSavingLinks,
  loadGoldSavingLinks,
  replaceGoldSavingLinks,
  resolveSchemeCredits,
} from '../goldSavings/billingCredit'
import { asyncHandler, parseBody, parseIdParam, parsePaging, queryString } from '../lib/http'
import { saveLastPrintedBill } from '../lib/settingsStore'
import { listHuids, appendHuids, removeHuids } from '../products/huids'
import { recordPieceMovement } from '../stock/movements'
import { EMPTY_PRODUCT_VARIANT_FIELDS } from '@shared/types'
import { assertCustomerAllowedForBill } from './customers.routes'
import { insertPayment } from './dues.routes'
import { getLatestMetalRates } from './metalRates.routes'
import { getPurchaseBalance } from '../oldGold/balance'

const router = Router()

type InvoiceRow = {
  id: number
  customer_id: number
  customer_name: string
  customer_phone: string
  customer_gstin: string
  invoice_no: string
  invoice_date: string
  subtotal: number
  tax: number
  total: number
  status: 'draft' | 'final' | 'cancelled'
  created_at: string
  bill_format: BillFormat
  payment_mode: PaymentMode
  amount_paid: number
  balance_due: number
  discount: number
  cgst: number
  sgst: number
  igst: number
  is_estimate: number
  is_historical: number
  summary_gold_g: number
  summary_silver_g: number
  summary_making: number
  round_off: number
  amount_payable: number
  customer_name_snap: string
  customer_phone_snap: string
  customer_address_snap: string
  customer_gstin_snap: string
  rates_snapshot: string
  cancelled_at: string | null
  cancel_reason: string
  cancelled_by: number | null
}

type InvoiceItemRow = {
  id: number
  invoice_id: number
  product_id: number | null
  product_name: string | null
  qty: number
  rate: number
  line_total: number
  gross_weight: number
  net_weight: number
  stone_weight: number
  metal_rate: number
  making_charges: number
  wastage_pct: number
  stone_rate: number
  other_charges: number
  line_subtotal: number
  line_tax: number
  hsn_code: string
  metal: string
  category: string
  line_kind: InvoiceLineKind
  description: string
  purity: string
  huid: string
}

function yearFromInvoiceDate(invoiceDate?: string): string {
  const year = (invoiceDate ?? '').slice(0, 4)
  return /^\d{4}$/.test(year) ? year : String(new Date().getFullYear())
}

/**
 * Next number in a `<PREFIX>-<year>-NNNN` series. Uses a numeric max so the
 * series keeps counting past 9999 (a text sort puts "-10000" before "-9999").
 */
function nextSerialNo(db: ReturnType<typeof getDatabase>, prefix: string): string {
  const row = db
    .prepare(
      `SELECT MAX(CAST(substr(invoice_no, ?) AS INTEGER)) AS max_seq
       FROM invoices
       WHERE invoice_no LIKE ?`,
    )
    .get(prefix.length + 1, `${prefix}%`) as { max_seq: number | null } | undefined
  const next = (row?.max_seq ?? 0) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

function nextInvoiceNo(
  db: ReturnType<typeof getDatabase>,
  billFormat: BillFormat = 'cash_bill',
  invoiceDate?: string,
): string {
  const year = yearFromInvoiceDate(invoiceDate)
  const prefix = billFormat === 'tax_invoice' ? `TI-${year}-` : `CB-${year}-`
  return nextSerialNo(db, prefix)
}

function nextEstimateNo(db: ReturnType<typeof getDatabase>, invoiceDate?: string): string {
  return nextSerialNo(db, `EST-${yearFromInvoiceDate(invoiceDate)}-`)
}

let tempInvoiceNoSerial = 0

/** Unique throwaway number for the instant before a draft's own id is known. */
function tempInvoiceNo(): string {
  tempInvoiceNoSerial += 1
  return `TMP-${Date.now()}-${tempInvoiceNoSerial}`
}

/**
 * The provisional number a draft should keep. Legacy CB-/TI- drafts keep their
 * number; a new or toggled draft uses `DRAFT-<id>` or the estimate series.
 */
function provisionalInvoiceNo(
  db: ReturnType<typeof getDatabase>,
  id: number,
  isEstimate: boolean,
  invoiceDate: string,
  currentNo: string,
): string {
  if (!isProvisionalInvoiceNo(currentNo)) return currentNo
  if (isEstimate) {
    return isEstimateInvoiceNo(currentNo) ? currentNo : nextEstimateNo(db, invoiceDate)
  }
  return `DRAFT-${id}`
}

function loadProductsMap(db: ReturnType<typeof getDatabase>) {
  const products = db.prepare('SELECT * FROM products').all() as {
    id: number
    name: string
    category: string
    metal: string
    purity: string
    gross_weight: number
    net_weight: number
    making_charges: number
    stock_qty: number
    image_path: string
    updated_at: string
    parent_id?: number | null
    variant_code?: string | null
    size?: string | null
    stone_weight?: number | null
    stone_details?: string | null
    attributes?: string | null
    is_active?: number | null
  }[]

  return new Map(
    products.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        category: p.category,
        metal: p.metal,
        purity: p.purity,
        grossWeight: p.gross_weight,
        netWeight: p.net_weight,
        makingCharges: p.making_charges,
        stockQty: p.stock_qty,
        imagePath: p.image_path ?? '',
        updatedAt: p.updated_at,
        ...EMPTY_PRODUCT_VARIANT_FIELDS,
        parentId: p.parent_id ?? null,
        variantCode: p.variant_code ?? '',
        size: p.size ?? '',
        stoneWeight: p.stone_weight ?? 0,
        stoneDetails: p.stone_details ?? '',
        isActive: (p.is_active ?? 1) === 1,
      },
    ]),
  )
}

function loadInvoiceItems(db: ReturnType<typeof getDatabase>, invoiceId: number): InvoiceItem[] {
  const rows = db
    .prepare(
      `SELECT ii.*, p.name AS product_name
       FROM invoice_items ii
       LEFT JOIN products p ON p.id = ii.product_id
       WHERE ii.invoice_id = ?
       ORDER BY ii.id`,
    )
    .all(invoiceId) as InvoiceItemRow[]

  return rows.map((row) => ({
    id: row.id,
    invoiceId: row.invoice_id,
    productId: row.product_id,
    productName:
      row.description ||
      row.product_name ||
      (row.line_kind === 'exchange' ? 'Old gold exchange' : 'Item'),
    qty: row.qty,
    rate: row.rate,
    lineTotal: row.line_total,
    grossWeight: row.gross_weight,
    netWeight: row.net_weight,
    stoneWeight: row.stone_weight,
    metalRate: row.metal_rate,
    makingCharges: row.making_charges,
    wastagePct: row.wastage_pct,
    stoneRate: row.stone_rate,
    otherCharges: row.other_charges ?? 0,
    lineSubtotal: row.line_subtotal,
    lineTax: row.line_tax,
    hsnCode: row.hsn_code,
    metal: row.metal,
    category: row.category,
    lineKind: row.line_kind ?? 'sale',
    description: row.description ?? '',
    purity: row.purity ?? '',
    huid: row.huid ?? '',
  }))
}

function paymentModeFromNote(note: string, fallback: PaymentMode): PaymentMode {
  const lower = note.toLowerCase()
  if (/\bupi\b/.test(lower)) return 'upi'
  if (/\bcard\b/.test(lower)) return 'card'
  if (/\bmixed\b/.test(lower)) return 'mixed'
  if (/\bcash\b/.test(lower)) return 'cash'
  return fallback
}

function loadOldGold(db: ReturnType<typeof getDatabase>, invoiceId: number): OldGoldItem[] {
  const rows = db
    .prepare(
      `SELECT id, invoice_id, description, gross_weight, stone_weight, net_weight, purity,
              rate_per_gram, deduction_pct, gross_value, deduction_amount, final_value
       FROM invoice_old_gold
       WHERE invoice_id = ?
       ORDER BY id`,
    )
    .all(invoiceId) as Array<{
    id: number
    invoice_id: number
    description: string
    gross_weight: number
    stone_weight: number
    net_weight: number
    purity: string
    rate_per_gram: number
    deduction_pct: number
    gross_value: number
    deduction_amount: number
    final_value: number
  }>

  return rows.map((row) => ({
    id: row.id,
    invoiceId: row.invoice_id,
    description: row.description ?? '',
    grossWeight: row.gross_weight,
    stoneWeight: row.stone_weight,
    netWeight: row.net_weight,
    purity: row.purity ?? '',
    ratePerGram: row.rate_per_gram,
    deductionPct: row.deduction_pct,
    grossValue: row.gross_value,
    deductionAmount: row.deduction_amount,
    finalValue: row.final_value,
  }))
}

function loadPayments(
  db: ReturnType<typeof getDatabase>,
  invoiceId: number,
  fallbackMode: PaymentMode,
): InvoicePayment[] {
  const rows = db
    .prepare(
      `SELECT id, entry_date, amount, note, created_at
       FROM customer_dues
       WHERE invoice_id = ? AND kind = 'payment'
       ORDER BY entry_date ASC, id ASC`,
    )
    .all(invoiceId) as Array<{
    id: number
    entry_date: string
    amount: number
    note: string
    created_at: string
  }>

  return rows.map((row) => ({
    id: row.id,
    date: row.entry_date,
    mode: paymentModeFromNote(row.note ?? '', fallbackMode),
    amount: row.amount,
    note: row.note ?? '',
    createdAt: row.created_at,
  }))
}

function replaceOldGold(
  db: ReturnType<typeof getDatabase>,
  invoiceId: number,
  items: OldGoldItemInput[],
): void {
  db.prepare('DELETE FROM invoice_old_gold WHERE invoice_id = ?').run(invoiceId)
  if (items.length === 0) return

  const insert = db.prepare(
    `INSERT INTO invoice_old_gold (
      invoice_id, description, gross_weight, stone_weight, net_weight, purity,
      rate_per_gram, deduction_pct, gross_value, deduction_amount, final_value, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  )

  for (const item of items) {
    const stoneWeight = item.stoneWeight ?? 0
    const netWeight = item.netWeight > 0 ? item.netWeight : Math.max(0, item.grossWeight - stoneWeight)
    const priced = computeOldGoldValue({
      netWeight,
      ratePerGram: item.ratePerGram,
      deductionPct: item.deductionPct,
    })
    insert.run(
      invoiceId,
      item.description?.trim() || 'Old gold exchange',
      item.grossWeight,
      stoneWeight,
      netWeight,
      item.purity?.trim() || '',
      item.ratePerGram,
      item.deductionPct ?? 0,
      priced.grossValue,
      priced.deductionAmount,
      priced.finalValue,
    )
  }
}

function loadOldGoldLinks(db: ReturnType<typeof getDatabase>, invoiceId: number): OldGoldPurchaseLink[] {
  const rows = db
    .prepare(
      `SELECT l.id, l.invoice_id, l.purchase_id, l.amount_applied,
              p.purchase_no, p.customer_name, p.purchase_date, p.total_amount,
              COALESCE((SELECT SUM(i.net_weight) FROM old_gold_purchase_items i WHERE i.purchase_id = p.id), 0) AS net_weight,
              COALESCE((SELECT SUM(o.amount) FROM old_gold_payouts o
                        WHERE o.purchase_id = p.id AND o.voided_at IS NULL), 0) AS paid_out,
              COALESCE((SELECT SUM(o.amount_applied) FROM invoice_old_gold_links o
                        WHERE o.purchase_id = p.id AND o.invoice_id != l.invoice_id), 0) AS other_applied
       FROM invoice_old_gold_links l
       JOIN old_gold_purchases p ON p.id = l.purchase_id
       WHERE l.invoice_id = ?
       ORDER BY l.id`,
    )
    .all(invoiceId) as Array<{
    id: number
    invoice_id: number
    purchase_id: number
    amount_applied: number
    purchase_no: string
    customer_name: string
    purchase_date: string
    total_amount: number
    net_weight: number
    paid_out: number
    other_applied: number
  }>

  return rows.map((row) => ({
    id: row.id,
    invoiceId: row.invoice_id,
    purchaseId: row.purchase_id,
    purchaseNo: row.purchase_no,
    customerName: row.customer_name ?? '',
    purchaseDate: row.purchase_date,
    amountApplied: row.amount_applied,
    netWeight: row.net_weight,
    purchaseTotal: roundMoney(row.total_amount),
    balance: roundMoney(
      Math.max(0, row.total_amount - row.paid_out - row.other_applied - row.amount_applied),
    ),
  }))
}

function resolveLinkedOldGoldCredit(
  db: ReturnType<typeof getDatabase>,
  links: OldGoldPurchaseLinkInput[],
  currentInvoiceId?: number,
): number {
  if (links.length === 0) return 0
  const seen = new Set<number>()
  let total = 0
  for (const link of links) {
    if (seen.has(link.purchaseId)) continue
    seen.add(link.purchaseId)
    const row = db
      .prepare('SELECT id, purchase_no, total_amount, status FROM old_gold_purchases WHERE id = ?')
      .get(link.purchaseId) as
      | { id: number; purchase_no: string; total_amount: number; status: string }
      | undefined
    if (!row) {
      throw new Error('Old gold purchase not found')
    }
    if (row.status === 'cancelled') {
      throw new Error(`${row.purchase_no} is cancelled`)
    }
    if (row.status !== 'final') {
      throw new Error(`${row.purchase_no} must be finalized before it can be applied to a sale bill`)
    }
    const balance = getPurchaseBalance(db, row.id, { excludeInvoiceId: currentInvoiceId }).balance
    if (balance <= 0.009) {
      const appliedElsewhere = db
        .prepare(
          `SELECT i.invoice_no AS invoice_no
           FROM invoice_old_gold_links l
           JOIN invoices i ON i.id = l.invoice_id
           WHERE l.purchase_id = ? AND l.invoice_id != ?
           LIMIT 1`,
        )
        .get(row.id, currentInvoiceId ?? -1) as { invoice_no: string } | undefined
      if (appliedElsewhere) {
        throw new Error(`${row.purchase_no} is already applied to ${appliedElsewhere.invoice_no}`)
      }
      throw new Error(`${row.purchase_no} has no balance left to apply`)
    }
    const requested = link.amount == null ? balance : roundMoney(link.amount)
    if (requested <= 0) {
      throw new Error(`Enter an amount to apply from ${row.purchase_no}`)
    }
    if (requested - balance > 0.009) {
      throw new Error(`Only ${balance.toFixed(2)} is left on ${row.purchase_no}`)
    }
    total += requested
  }
  return roundMoney(total)
}

function replaceOldGoldLinks(
  db: ReturnType<typeof getDatabase>,
  invoiceId: number,
  links: OldGoldPurchaseLinkInput[],
): number {
  db.prepare('DELETE FROM invoice_old_gold_links WHERE invoice_id = ?').run(invoiceId)
  if (links.length === 0) return 0

  const insert = db.prepare(
    `INSERT INTO invoice_old_gold_links (invoice_id, purchase_id, amount_applied, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
  )
  const seen = new Set<number>()
  let total = 0
  for (const link of links) {
    if (seen.has(link.purchaseId)) continue
    seen.add(link.purchaseId)
    const row = db
      .prepare('SELECT id, total_amount FROM old_gold_purchases WHERE id = ?')
      .get(link.purchaseId) as { id: number; total_amount: number } | undefined
    if (!row) {
      throw new Error('Old gold purchase not found')
    }
    // The amount applied is independent of the bill total, so one purchase can
    // be spread over several bills and only draw what each one needs.
    const balance = getPurchaseBalance(db, row.id, { excludeInvoiceId: invoiceId }).balance
    const amount = link.amount == null ? balance : roundMoney(Math.min(link.amount, balance))
    if (amount <= 0) continue
    insert.run(invoiceId, row.id, amount)
    total += amount
  }
  return roundMoney(total)
}

function mixedPaymentsTotal(parts: MixedPaymentPart[] | undefined): number {
  return roundMoney((parts ?? []).reduce((sum, part) => sum + part.amount, 0))
}

function assertPayableRules(amountBeforeRoundOff: number, roundOff: number, paid: number, amountPayable: number) {
  if (amountPayable < -0.009) {
    throw new Error('Amount payable cannot be negative')
  }
  if (Math.abs(roundOff) > 0 && Math.abs(amountBeforeRoundOff) > 0 && Math.abs(roundOff) >= Math.abs(amountBeforeRoundOff)) {
    throw new Error('Round off must be smaller than the amount before round off')
  }
  if (paid - amountPayable > 0.009) {
    throw new Error('Amount paid cannot be more than the amount payable')
  }
}

function customerSnapshotFromRow(row: InvoiceRow): BillCustomerInfo | null {
  const name = row.customer_name_snap ?? ''
  const phone = row.customer_phone_snap ?? ''
  const address = row.customer_address_snap ?? ''
  const gstin = row.customer_gstin_snap ?? ''
  if (!name && !phone && !address && !gstin) return null
  return { name, phone, address, gstin }
}

function ratesSnapshotFromRow(row: InvoiceRow): MetalRates | null {
  const raw = (row.rates_snapshot ?? '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<MetalRates>
    return {
      id: 0,
      effectiveDate: parsed.effectiveDate ?? '',
      gold22k: parsed.gold22k ?? 0,
      gold24k: parsed.gold24k ?? 0,
      gold20k: parsed.gold20k ?? 0,
      gold18k: parsed.gold18k ?? 0,
      silverFine: parsed.silverFine ?? 0,
      silver925: parsed.silver925 ?? 0,
      createdAt: parsed.createdAt ?? '',
    }
  } catch {
    return null
  }
}

function mapInvoice(
  db: ReturnType<typeof getDatabase>,
  row: InvoiceRow,
  options: { includeExtras?: boolean } = { includeExtras: true },
): Invoice {
  const includeExtras = options.includeExtras !== false
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? '',
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    subtotal: row.subtotal,
    tax: row.tax,
    total: row.total,
    status: row.status,
    items: loadInvoiceItems(db, row.id),
    createdAt: row.created_at,
    billFormat: row.bill_format,
    paymentMode: row.payment_mode,
    amountPaid: row.amount_paid,
    balanceDue: row.balance_due,
    discount: row.discount,
    cgst: row.cgst,
    sgst: row.sgst,
    igst: row.igst,
    isEstimate: row.is_estimate === 1,
    isHistorical: row.is_historical === 1,
    summaryGoldG: row.summary_gold_g ?? 0,
    summarySilverG: row.summary_silver_g ?? 0,
    summaryMaking: row.summary_making ?? 0,
    oldGold: includeExtras ? loadOldGold(db, row.id) : [],
    oldGoldLinks: includeExtras ? loadOldGoldLinks(db, row.id) : [],
    goldSavingLinks: includeExtras ? loadGoldSavingLinks(db, row.id) : [],
    roundOff: row.round_off ?? 0,
    amountPayable: resolveAmountPayable(row.amount_payable, row.total),
    payments: includeExtras ? loadPayments(db, row.id, row.payment_mode) : [],
    customerSnapshot: customerSnapshotFromRow(row),
    ratesSnapshot: ratesSnapshotFromRow(row),
    cancelledAt: row.cancelled_at ?? null,
    cancelReason: row.cancel_reason ?? '',
    cancelledBy: row.cancelled_by ?? null,
  }
}

function mapInvoiceSummary(row: InvoiceRow & { item_count?: number }): Invoice {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? '',
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    subtotal: row.subtotal,
    tax: row.tax,
    total: row.total,
    status: row.status,
    items: [],
    itemCount: Number(row.item_count ?? 0),
    createdAt: row.created_at,
    billFormat: row.bill_format,
    paymentMode: row.payment_mode,
    amountPaid: row.amount_paid,
    balanceDue: row.balance_due,
    discount: row.discount,
    cgst: row.cgst,
    sgst: row.sgst,
    igst: row.igst,
    isEstimate: row.is_estimate === 1,
    isHistorical: row.is_historical === 1,
    summaryGoldG: row.summary_gold_g ?? 0,
    summarySilverG: row.summary_silver_g ?? 0,
    summaryMaking: row.summary_making ?? 0,
    oldGold: [],
    oldGoldLinks: [],
    goldSavingLinks: [],
    roundOff: row.round_off ?? 0,
    amountPayable: resolveAmountPayable(row.amount_payable, row.total),
    payments: [],
    customerSnapshot: customerSnapshotFromRow(row),
    ratesSnapshot: ratesSnapshotFromRow(row),
    cancelledAt: row.cancelled_at ?? null,
    cancelReason: row.cancel_reason ?? '',
    cancelledBy: row.cancelled_by ?? null,
  }
}

function getInvoiceRow(db: ReturnType<typeof getDatabase>, id: number): InvoiceRow {
  const row = db
    .prepare(
      `SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, c.gstin AS customer_gstin
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.id = ?`,
    )
    .get(id) as InvoiceRow | undefined
  if (!row) {
    throw new Error('Invoice not found')
  }
  return row
}

function assertDraft(db: ReturnType<typeof getDatabase>, id: number): void {
  const invoice = db.prepare('SELECT status FROM invoices WHERE id = ?').get(id) as
    | { status: string }
    | undefined
  if (!invoice) {
    throw new Error('Invoice not found')
  }
  if (invoice.status !== 'draft') {
    throw new Error('Only draft invoices can be modified')
  }
}

function insertItems(
  db: ReturnType<typeof getDatabase>,
  invoiceId: number,
  computedLines: ReturnType<typeof computeInvoiceLines>,
): void {
  const insert = db.prepare(
    `INSERT INTO invoice_items (
      invoice_id, product_id, qty, rate, line_total,
      gross_weight, net_weight, stone_weight, metal_rate, making_charges,
      wastage_pct, stone_rate, other_charges, line_subtotal, line_tax, hsn_code, metal, category,
      line_kind, description, purity, huid
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const line of computedLines) {
    insert.run(
      invoiceId,
      line.productId,
      line.input.qty,
      line.rate,
      line.lineTotal,
      line.grossWeight,
      line.netWeight,
      line.stoneWeight,
      line.metalRate,
      line.makingCharges,
      line.wastagePct,
      line.stoneRate,
      line.otherCharges,
      line.lineSubtotal,
      line.lineTax,
      line.hsnCode,
      line.metal,
      line.category,
      line.lineKind,
      line.description,
      line.purity,
      (line.input.huid ?? '').trim().toUpperCase(),
    )
  }
}

/** Validates HUIDs picked on bill lines: tagged on the product and unique within the bill. */
function assertLineHuids(db: ReturnType<typeof getDatabase>, lines: ReturnType<typeof computeInvoiceLines>): void {
  const seen = new Set<string>()
  for (const line of lines) {
    if (line.lineKind === 'exchange') continue
    const huid = (line.input.huid ?? '').trim().toUpperCase()
    if (!huid) continue
    if (line.productId == null) {
      throw new Error('HUID can only be set on a saved product line')
    }
    if (seen.has(huid)) {
      throw new Error(`HUID ${huid} is used twice on this bill`)
    }
    seen.add(huid)
    const tagged = db
      .prepare('SELECT 1 FROM product_huids WHERE product_id = ? AND huid = ?')
      .get(line.productId, huid)
    if (!tagged) {
      throw new Error(`HUID ${huid} is not tagged on this product`)
    }
  }
}

function historicalAmounts(input: HistoricalInvoiceInput) {
  const subtotal = roundMoney(input.subtotal)
  const discount = roundMoney(Math.min(input.discount ?? 0, subtotal))
  const taxable = roundMoney(subtotal - discount)
  const useIgst = input.useIgst ?? false
  const autoTax = input.billFormat === 'tax_invoice' && (input.autoTax ?? true)

  if (autoTax) {
    const tax = computeInvoiceTax(taxable, useIgst)
    return {
      subtotal,
      discount,
      taxable,
      cgst: tax.cgst,
      sgst: tax.sgst,
      igst: tax.igst,
      tax: tax.tax,
      total: roundMoney(taxable + tax.tax),
    }
  }

  const manualTax = input.billFormat === 'tax_invoice' ? roundMoney(input.tax ?? 0) : 0
  if (useIgst) {
    return {
      subtotal,
      discount,
      taxable,
      cgst: 0,
      sgst: 0,
      igst: manualTax,
      tax: manualTax,
      total: roundMoney(taxable + manualTax),
    }
  }
  const half = roundMoney(manualTax / 2)
  return {
    subtotal,
    discount,
    taxable,
    cgst: half,
    sgst: roundMoney(manualTax - half),
    igst: 0,
    tax: manualTax,
    total: roundMoney(taxable + manualTax),
  }
}

function recordHistoricalInvoice(
  db: ReturnType<typeof getDatabase>,
  input: HistoricalInvoiceInput,
): Invoice {
  assertCustomerAllowedForBill(db, input.customerId)

  const invoiceNo = input.invoiceNo.trim()
  const existing = db.prepare('SELECT id FROM invoices WHERE invoice_no = ?').get(invoiceNo)
  if (existing) {
    throw new Error(`Bill number ${invoiceNo} is already used`)
  }

  const amounts = historicalAmounts(input)
  if (amounts.total <= 0) {
    throw new Error('Bill amount must be greater than zero')
  }
  if (input.amountPaid > amounts.total) {
    throw new Error('Amount paid cannot be more than the bill total')
  }

  const paid = roundMoney(input.amountPaid)
  const balance = roundMoney(Math.max(0, amounts.total - paid))

  const result = db
    .prepare(
      `INSERT INTO invoices (
        customer_id, invoice_no, invoice_date, subtotal, tax, total, status, created_at,
        bill_format, payment_mode, amount_paid, balance_due, discount, cgst, sgst, igst, is_estimate,
        is_historical, summary_gold_g, summary_silver_g, summary_making, round_off, amount_payable
      ) VALUES (?, ?, ?, ?, ?, ?, 'final', datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, 0, ?)`,
    )
    .run(
      input.customerId,
      invoiceNo,
      input.invoiceDate,
      amounts.subtotal,
      amounts.tax,
      amounts.total,
      input.billFormat,
      input.paymentMode,
      paid,
      balance,
      amounts.discount,
      amounts.cgst,
      amounts.sgst,
      amounts.igst,
      input.goldWeight ?? 0,
      input.silverWeight ?? 0,
      input.makingCharges ?? 0,
      amounts.total,
    )

  const id = Number(result.lastInsertRowid)
  syncDueEntryForFinalInvoice(db, id)
  return mapInvoice(db, getInvoiceRow(db, id))
}

function saveDraftInvoice(
  db: ReturnType<typeof getDatabase>,
  input: InvoiceInput,
  options?: { invoiceId?: number; isAdmin?: boolean },
): Invoice {
  const invoiceId = options?.invoiceId
  const billFormat: BillFormat = input.billFormat ?? 'cash_bill'
  assertCustomerAllowedForBill(db, input.customerId)

  const productsById = loadProductsMap(db)
  const metalRates = getLatestMetalRates(db)
  const computedLines = computeInvoiceLines(input.items, productsById, metalRates)
  assertLineHuids(db, computedLines)

  const paymentMode: PaymentMode = input.paymentMode ?? 'cash'
  const discount = input.discount ?? 0
  const autoTax = input.autoTax ?? billFormat === 'tax_invoice'
  const useIgst = input.useIgst ?? false
  const oldGold = input.oldGold ?? []
  const oldGoldLinks = input.oldGoldLinks ?? []
  const goldSavingLinks = input.goldSavingLinks ?? []
  const roundOff = input.roundOff ?? 0
  const mixedTotal = mixedPaymentsTotal(input.mixedPayments)
  const linkedCredit = resolveLinkedOldGoldCredit(db, oldGoldLinks, invoiceId)
  const baseOptions = {
    discount,
    autoTax,
    useIgst,
    manualTax: input.tax,
    amountPaid: 0,
    oldGold,
    extraOldGoldCredit: linkedCredit,
    roundOff,
  }
  // First pass without the scheme credit, to learn what is still payable.
  const base = computeInvoiceAmounts(computedLines, baseOptions)
  const schemeAvailable = roundMoney(base.summary.invoiceTotal - base.summary.oldGoldTotal)
  const scheme = resolveSchemeCredits(db, goldSavingLinks, {
    customerId: input.customerId,
    available: schemeAvailable,
    invoiceDate: input.invoiceDate,
    invoiceId,
    acceptRateDate: input.acceptRateDate,
    isAdmin: options?.isAdmin ?? false,
  })
  const { totals, summary } = computeInvoiceAmounts(computedLines, {
    ...baseOptions,
    schemeCredit: scheme.total,
  })

  const paid =
    paymentMode === 'mixed' && mixedTotal > 0
      ? mixedTotal
      : input.amountPaid !== undefined
        ? input.amountPaid
        : paymentMode === 'cash'
          ? summary.amountPayable
          : 0
  assertPayableRules(summary.amountBeforeRoundOff, summary.roundOff, paid, summary.amountPayable)
  const balance = Math.max(0, summary.amountPayable - paid)
  const isEstimate = input.isEstimate ? 1 : 0

  if (invoiceId) {
    assertDraft(db, invoiceId)
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoiceId)
    db.prepare(
      `UPDATE invoices SET
        customer_id = ?, invoice_date = ?, subtotal = ?, tax = ?, total = ?,
        bill_format = ?, payment_mode = ?, amount_paid = ?, balance_due = ?,
        discount = ?, cgst = ?, sgst = ?, igst = ?, is_estimate = ?,
        round_off = ?, amount_payable = ?
       WHERE id = ?`,
    ).run(
      input.customerId,
      input.invoiceDate,
      totals.subtotal,
      totals.tax,
      totals.total,
      billFormat,
      paymentMode,
      paid,
      balance,
      totals.discount,
      totals.cgst,
      totals.sgst,
      totals.igst,
      isEstimate,
      summary.roundOff,
      summary.amountPayable,
      invoiceId,
    )
    insertItems(db, invoiceId, computedLines)
    replaceOldGold(db, invoiceId, oldGold)
    replaceOldGoldLinks(db, invoiceId, oldGoldLinks)
    replaceGoldSavingLinks(db, invoiceId, scheme.credits)
    const current = db
      .prepare('SELECT invoice_no FROM invoices WHERE id = ?')
      .get(invoiceId) as { invoice_no: string }
    const provisional = provisionalInvoiceNo(
      db,
      invoiceId,
      isEstimate === 1,
      input.invoiceDate,
      current.invoice_no,
    )
    if (provisional !== current.invoice_no) {
      db.prepare('UPDATE invoices SET invoice_no = ? WHERE id = ?').run(provisional, invoiceId)
    }
    return mapInvoice(db, getInvoiceRow(db, invoiceId))
  }

  const result = db
    .prepare(
      `INSERT INTO invoices (
        customer_id, invoice_no, invoice_date, subtotal, tax, total, status, created_at,
        bill_format, payment_mode, amount_paid, balance_due, discount, cgst, sgst, igst, is_estimate,
        round_off, amount_payable
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.customerId,
      tempInvoiceNo(),
      input.invoiceDate,
      totals.subtotal,
      totals.tax,
      totals.total,
      billFormat,
      paymentMode,
      paid,
      balance,
      totals.discount,
      totals.cgst,
      totals.sgst,
      totals.igst,
      isEstimate,
      summary.roundOff,
      summary.amountPayable,
    )

  const id = Number(result.lastInsertRowid)
  const invoiceNo = isEstimate === 1 ? nextEstimateNo(db, input.invoiceDate) : `DRAFT-${id}`
  db.prepare('UPDATE invoices SET invoice_no = ? WHERE id = ?').run(invoiceNo, id)
  insertItems(db, id, computedLines)
  replaceOldGold(db, id, oldGold)
  replaceOldGoldLinks(db, id, oldGoldLinks)
  replaceGoldSavingLinks(db, id, scheme.credits)
  return mapInvoice(db, getInvoiceRow(db, id))
}

function invoiceListFilter(query: Request['query']): { where: string; params: unknown[] } {
  const clauses = ['1 = 1']
  const params: unknown[] = []
  const from = queryString(query, 'from')
  const to = queryString(query, 'to')
  const q = queryString(query, 'q')
  const format = queryString(query, 'format')
  const status = queryString(query, 'status')
  const paymentMode = queryString(query, 'paymentMode')
  const duePaid = queryString(query, 'duePaid')
  const customerId = queryString(query, 'customerId')

  if (from) {
    clauses.push('i.invoice_date >= ?')
    params.push(from)
  }
  if (to) {
    clauses.push('i.invoice_date <= ?')
    params.push(to)
  }
  if (format === 'cash_bill' || format === 'tax_invoice') {
    clauses.push('i.bill_format = ?')
    params.push(format)
  }
  if (q) {
    const like = `%${q}%`
    clauses.push('(i.invoice_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)')
    params.push(like, like, like)
  }
  if (customerId) {
    const id = Number.parseInt(customerId, 10)
    if (Number.isInteger(id) && id > 0) {
      clauses.push('i.customer_id = ?')
      params.push(id)
    }
  }
  if (status === 'draft') {
    clauses.push("i.status = 'draft' AND i.is_estimate = 0")
  } else if (status === 'estimate') {
    clauses.push('i.is_estimate = 1')
  } else if (status === 'final') {
    clauses.push("i.status = 'final' AND i.is_estimate = 0")
  } else if (status === 'cancelled') {
    clauses.push("i.status = 'cancelled'")
  }
  if (paymentMode === 'cash' || paymentMode === 'upi' || paymentMode === 'card' || paymentMode === 'mixed') {
    clauses.push('i.payment_mode = ?')
    params.push(paymentMode)
  }
  if (duePaid === 'due') {
    clauses.push("i.status = 'final' AND i.balance_due > 0")
  } else if (duePaid === 'paid') {
    clauses.push("i.status = 'final' AND i.is_estimate = 0 AND i.balance_due <= 0")
  }

  return { where: clauses.join(' AND '), params }
}

router.get(
  '/tax-report',
  asyncHandler((_req, res) => {
    const rows = getDatabase()
      .prepare(
        `SELECT
          strftime('%Y-%m', invoice_date) AS month,
          SUM(subtotal - discount) AS taxable_sales,
          SUM(cgst) AS cgst,
          SUM(sgst) AS sgst,
          SUM(igst) AS igst,
          COUNT(*) AS invoice_count
         FROM invoices
         WHERE status = 'final' AND is_estimate = 0
           AND (is_historical = 0 OR bill_format = 'tax_invoice')
         GROUP BY strftime('%Y-%m', invoice_date)
         ORDER BY month DESC
         LIMIT 24`,
      )
      .all() as {
      month: string
      taxable_sales: number
      cgst: number
      sgst: number
      igst: number
      invoice_count: number
    }[]

    res.json(
      rows.map(
        (row): TaxReportRow => ({
          month: row.month,
          taxableSales: row.taxable_sales,
          cgst: row.cgst,
          sgst: row.sgst,
          igst: row.igst,
          invoiceCount: row.invoice_count,
        }),
      ),
    )
  }),
)

router.get(
  '/next-invoice-no',
  asyncHandler((req, res) => {
    const raw = typeof req.query.format === 'string' ? req.query.format : 'cash_bill'
    const billFormat: BillFormat = raw === 'tax_invoice' ? 'tax_invoice' : 'cash_bill'
    const db = getDatabase()
    res.json({ invoiceNo: nextInvoiceNo(db, billFormat) })
  }),
)

router.get(
  '/stats',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const from = queryString(req.query, 'from')
    const to = queryString(req.query, 'to')
    const granularity = queryString(req.query, 'granularity')
    const rangeParams = from && to ? [from, to] : []
    const saleWhere =
      from && to
        ? `status = 'final' AND is_estimate = 0 AND is_historical = 0 AND invoice_date >= ? AND invoice_date <= ?`
        : `status = 'final' AND is_estimate = 0 AND is_historical = 0`

    const totals = db
      .prepare(
        `SELECT
            COALESCE(SUM(total), 0) AS sales,
            COALESCE(SUM(amount_paid), 0) AS paid,
            COUNT(*) AS bills,
            COUNT(DISTINCT customer_id) AS customers,
            COALESCE(SUM((SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = invoices.id)), 0) AS items
         FROM invoices
         WHERE ${saleWhere}`,
      )
      .get(...rangeParams) as {
      sales: number
      paid: number
      bills: number
      customers: number
      items: number
    }

    const extraPayments = db
      .prepare(
        from && to
          ? `SELECT COALESCE(SUM(d.amount), 0) AS extra
             FROM customer_dues d
             LEFT JOIN invoices i ON i.id = d.invoice_id
             WHERE d.kind = 'payment' AND d.entry_date >= ? AND d.entry_date <= ?
               AND (d.invoice_id IS NULL OR i.invoice_date < d.entry_date)`
          : `SELECT COALESCE(SUM(d.amount), 0) AS extra
             FROM customer_dues d
             LEFT JOIN invoices i ON i.id = d.invoice_id
             WHERE d.kind = 'payment'
               AND (d.invoice_id IS NULL OR i.invoice_date < d.entry_date)`,
      )
      .get(...rangeParams) as { extra: number }

    const draftCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM invoices WHERE status = 'draft'`).get() as { n: number }
    ).n

    let chartSql = `SELECT invoice_date AS key, COALESCE(SUM(total), 0) AS total FROM invoices WHERE ${saleWhere} GROUP BY invoice_date`
    if (granularity === 'hour') {
      chartSql = `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS key, COALESCE(SUM(total), 0) AS total
                  FROM invoices WHERE ${saleWhere} GROUP BY key`
    } else if (granularity === 'month') {
      chartSql = `SELECT strftime('%Y-%m', invoice_date) AS key, COALESCE(SUM(total), 0) AS total
                  FROM invoices WHERE ${saleWhere} GROUP BY key`
    }

    let paidChartSql = `SELECT invoice_date AS key, COALESCE(SUM(amount_paid), 0) AS total FROM invoices WHERE ${saleWhere} GROUP BY invoice_date`
    if (granularity === 'hour') {
      paidChartSql = `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS key, COALESCE(SUM(amount_paid), 0) AS total
                      FROM invoices WHERE ${saleWhere} GROUP BY key`
    } else if (granularity === 'month') {
      paidChartSql = `SELECT strftime('%Y-%m', invoice_date) AS key, COALESCE(SUM(amount_paid), 0) AS total
                      FROM invoices WHERE ${saleWhere} GROUP BY key`
    }

    const extraPaymentWhere = from && to
      ? `d.kind = 'payment' AND d.entry_date >= ? AND d.entry_date <= ?
         AND (d.invoice_id IS NULL OR i.invoice_date < d.entry_date)`
      : `d.kind = 'payment' AND (d.invoice_id IS NULL OR i.invoice_date < d.entry_date)`
    let extraChartSql = `SELECT d.entry_date AS key, COALESCE(SUM(d.amount), 0) AS total
                         FROM customer_dues d
                         LEFT JOIN invoices i ON i.id = d.invoice_id
                         WHERE ${extraPaymentWhere}
                         GROUP BY d.entry_date`
    if (granularity === 'hour') {
      extraChartSql = `SELECT CAST(strftime('%H', d.created_at) AS INTEGER) AS key, COALESCE(SUM(d.amount), 0) AS total
                       FROM customer_dues d
                       LEFT JOIN invoices i ON i.id = d.invoice_id
                       WHERE ${extraPaymentWhere}
                       GROUP BY key`
    } else if (granularity === 'month') {
      extraChartSql = `SELECT strftime('%Y-%m', d.entry_date) AS key, COALESCE(SUM(d.amount), 0) AS total
                       FROM customer_dues d
                       LEFT JOIN invoices i ON i.id = d.invoice_id
                       WHERE ${extraPaymentWhere}
                       GROUP BY key`
    }

    const chart = db.prepare(chartSql).all(...rangeParams) as Array<{ key: string | number; total: number }>
    const paidChart = db.prepare(paidChartSql).all(...rangeParams) as Array<{ key: string | number; total: number }>
    const extraChart = db.prepare(extraChartSql).all(...rangeParams) as Array<{ key: string | number; total: number }>

    const collectionsByKey = new Map<string, number>()
    for (const row of [...paidChart, ...extraChart]) {
      const key = String(row.key)
      collectionsByKey.set(key, (collectionsByKey.get(key) ?? 0) + row.total)
    }
    const collectionsChart = Array.from(collectionsByKey, ([key, total]) => ({ key, total }))

    res.json({
      sales: totals.sales,
      collections: totals.paid + extraPayments.extra,
      draftCount,
      billsGenerated: totals.bills,
      customersBilled: totals.customers,
      totalItemsSold: totals.items,
      chart: chart.map((row) => ({ key: String(row.key), total: row.total })),
      collectionsChart,
    })
  }),
)

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const { page, pageSize, offset } = parsePaging(req.query)
    const sort = queryString(req.query, 'sort') === 'asc' ? 'ASC' : 'DESC'
    const { where, params } = invoiceListFilter(req.query)
    const fromSql = `FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE ${where}`
    const total = (
      db.prepare(`SELECT COUNT(*) AS n ${fromSql}`).get(...params) as { n: number }
    ).n
    const rows = db
      .prepare(
        `SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, c.gstin AS customer_gstin,
                (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) AS item_count
         ${fromSql}
         ORDER BY i.invoice_date ${sort}, i.id ${sort}
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as Array<InvoiceRow & { item_count: number }>
    res.json({
      items: rows.map((row) => mapInvoiceSummary(row)),
      total,
      page,
      pageSize,
    })
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    res.json(mapInvoice(db, getInvoiceRow(db, id)))
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(invoiceInputSchema, req.body) as InvoiceInput
    const db = getDatabase()
    const isAdmin = req.user?.role === 'admin'
    const tx = db.transaction(() => saveDraftInvoice(db, input, { isAdmin }))
    res.status(201).json(tx())
  }),
)

router.post(
  '/historical',
  asyncHandler((req, res) => {
    const input = parseBody(historicalInvoiceInputSchema, req.body) as HistoricalInvoiceInput
    const db = getDatabase()
    const tx = db.transaction(() => recordHistoricalInvoice(db, input))
    res.status(201).json(tx())
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(invoiceUpdateInputSchema, { ...req.body, id }) as InvoiceUpdateInput
    const db = getDatabase()
    const tx = db.transaction(() =>
      saveDraftInvoice(
        db,
        {
          customerId: input.customerId,
          invoiceDate: input.invoiceDate,
          tax: input.tax,
          items: input.items,
          billFormat: input.billFormat,
          paymentMode: input.paymentMode,
          amountPaid: input.amountPaid,
          discount: input.discount,
          autoTax: input.autoTax,
          useIgst: input.useIgst,
          isEstimate: input.isEstimate,
          oldGold: input.oldGold,
          oldGoldLinks: input.oldGoldLinks,
          goldSavingLinks: input.goldSavingLinks,
          acceptRateDate: input.acceptRateDate,
          roundOff: input.roundOff,
          mixedPayments: input.mixedPayments,
        },
        { invoiceId: input.id, isAdmin: req.user?.role === 'admin' },
      ),
    )
    res.json(tx())
  }),
)

router.post(
  '/:id/finalize',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const tx = db.transaction(() => {
      assertDraft(db, id)
      const row = getInvoiceRow(db, id)
      if (row.is_estimate) {
        throw new Error('Estimates cannot be finalized')
      }
      const payable = resolveAmountPayable(row.amount_payable, row.total)
      assertPayableRules(payable - (row.round_off ?? 0), row.round_off ?? 0, row.amount_paid, payable)
      const items = loadInvoiceItems(db, id)
      assertCustomerAllowedForBill(db, row.customer_id)
      assertMetalsOpenForDate(
        db,
        row.invoice_date,
        items.map((item) => item.metal).filter(Boolean),
      )

      for (const item of items) {
        if (item.lineKind === 'exchange' || item.productId == null) {
          continue
        }
        const taggedHuids = listHuids(db, item.productId)
        const huid = (item.huid ?? '').trim().toUpperCase()
        const stock = db
          .prepare('SELECT metal, stock_qty FROM products WHERE id = ?')
          .get(item.productId) as { metal: string; stock_qty: number } | undefined
        const mustPickHuid =
          stock != null &&
          huidRemovalRange(stock.metal, taggedHuids.length, stock.stock_qty, 1).min > 0
        if (mustPickHuid && item.qty === 1 && !huid) {
          throw new Error(`Pick a HUID for ${item.productName || 'this item'}`)
        }
        recordPieceMovement(db, {
          type: 'sale',
          productId: item.productId,
          qtyDelta: -item.qty,
          weightDelta: -((item.netWeight ?? 0) * item.qty),
          refType: 'invoice',
          refId: id,
          reason: 'Invoice finalize',
          operatorId: req.user?.id ?? null,
          movementDate: row.invoice_date,
        })
        if (huid) {
          removeHuids(db, item.productId, [huid])
        }
      }

      const rates = getLatestMetalRates(db)
      const customer = db
        .prepare('SELECT name, phone, address, gstin FROM customers WHERE id = ?')
        .get(row.customer_id) as
        | { name: string; phone: string; address: string; gstin: string }
        | undefined
      const assignedNo = isDraftInvoiceNo(row.invoice_no)
        ? nextInvoiceNo(db, row.bill_format, row.invoice_date)
        : row.invoice_no
      db.prepare(
        `UPDATE invoices
         SET status = 'final',
             invoice_no = ?,
             customer_name_snap = ?,
             customer_phone_snap = ?,
             customer_address_snap = ?,
             customer_gstin_snap = ?,
             rates_snapshot = ?
         WHERE id = ?`,
      ).run(
        assignedNo,
        customer?.name ?? row.customer_name ?? '',
        customer?.phone ?? row.customer_phone ?? '',
        customer?.address ?? '',
        customer?.gstin ?? '',
        rates ? JSON.stringify(rates) : '',
        id,
      )
      syncDueEntryForFinalInvoice(db, id)
      finalizeGoldSavingLinks(db, id, row.invoice_date, req.user?.id ?? null)
      if (row.payment_mode === 'mixed' && row.amount_paid > 0) {
        db.prepare(
          `UPDATE customer_dues
           SET note = CASE
             WHEN note LIKE 'Partial payment %' THEN replace(note, 'Partial payment', 'Mixed payment')
             ELSE note
           END
           WHERE invoice_id = ? AND kind = 'payment'`,
        ).run(id)
      }
      return mapInvoice(db, getInvoiceRow(db, id))
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/cancel',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(invoiceCancelInputSchema, req.body) as InvoiceCancelInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = getInvoiceRow(db, id)
      if (row.status === 'cancelled') {
        throw new Error('This bill is already cancelled')
      }
      if (row.status !== 'final') {
        throw new Error('Only a finalized bill can be cancelled')
      }
      if (row.is_historical) {
        throw new Error('Bills recorded from the old ledger cannot be cancelled')
      }
      const redemption = db
        .prepare('SELECT id FROM invoice_gold_saving_links WHERE invoice_id = ? LIMIT 1')
        .get(id)
      if (redemption) {
        throw new Error('This bill redeemed a gold savings scheme, so it cannot be cancelled')
      }

      const cancelDate = localTodayIso()
      const items = loadInvoiceItems(db, id)
      assertMetalsOpenForDate(
        db,
        cancelDate,
        items.map((item) => item.metal).filter(Boolean),
      )

      for (const item of items) {
        if (item.lineKind === 'exchange' || item.productId == null) {
          continue
        }
        const qty = item.qty || 1
        recordPieceMovement(db, {
          type: 'sales_return',
          productId: item.productId,
          qtyDelta: qty,
          weightDelta: (item.netWeight ?? 0) * qty,
          refType: 'invoice',
          refId: id,
          reason: `Bill ${row.invoice_no} cancelled`,
          operatorId: req.user?.id ?? null,
          movementDate: cancelDate,
        })
        const huid = (item.huid ?? '').trim().toUpperCase()
        if (huid && !listHuids(db, item.productId).includes(huid)) {
          appendHuids(db, item.productId, [huid])
        }
      }

      // The bill is gone, so its dues and its claim on linked old gold go too.
      db.prepare('DELETE FROM customer_dues WHERE invoice_id = ?').run(id)
      db.prepare('DELETE FROM invoice_old_gold_links WHERE invoice_id = ?').run(id)
      db.prepare(
        `UPDATE invoices
         SET status = 'cancelled', cancelled_at = datetime('now'), cancel_reason = ?, cancelled_by = ?
         WHERE id = ?`,
      ).run(input.reason.trim(), req.user?.id ?? null, id)
      return mapInvoice(db, getInvoiceRow(db, id))
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/payments',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(invoicePaymentInputSchema, req.body) as InvoicePaymentInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = getInvoiceRow(db, id)
      if (row.status !== 'final') {
        throw new Error('Payments can only be recorded on finalized invoices')
      }
      if (row.is_estimate) {
        throw new Error('Estimates cannot receive payments')
      }
      const payable = resolveAmountPayable(row.amount_payable, row.total)
      const remaining = roundMoney(Math.max(0, payable - row.amount_paid))
      if (input.amount - remaining > 0.009) {
        throw new Error('Payment cannot exceed the balance due')
      }
      const modeLabel = input.mode ? input.mode.toUpperCase() : row.payment_mode.toUpperCase()
      const note = input.note?.trim()
        ? `${modeLabel} · ${input.note.trim()}`
        : `${modeLabel} payment ${row.invoice_no}`
      insertPayment(db, {
        customerId: row.customer_id,
        entryDate: input.entryDate || localTodayIso(),
        amount: input.amount,
        note,
        invoiceId: id,
        pledgeId: null,
      })
      return mapInvoice(db, getInvoiceRow(db, id))
    })
    res.status(201).json(tx())
  }),
)

router.post(
  '/:id/printed',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const row = getInvoiceRow(db, id)
    saveLastPrintedBill(db, row.id, row.invoice_no, row.bill_format)
    res.json({ invoiceNo: row.invoice_no })
  }),
)

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    assertDraft(db, id)
    const result = db.prepare('DELETE FROM invoices WHERE id = ?').run(id)
    if (result.changes === 0) {
      throw new Error('Invoice not found')
    }
    res.status(204).end()
  }),
)

export default router
