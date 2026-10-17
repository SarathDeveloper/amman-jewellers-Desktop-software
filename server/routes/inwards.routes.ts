import { Router } from 'express'
import { inwardCancelInputSchema, inwardInputSchema, inwardUpdateInputSchema } from '@shared/schemas'
import type {
  Inward,
  InwardInput,
  InwardItem,
  InwardItemInput,
  InwardPieceInput,
  InwardSource,
  InwardStatus,
  InwardUpdateInput,
  PurchaseGstMode,
  PurchasePaymentMode,
} from '@shared/types'
import { getDatabase } from '../db'
import { assertMetalsOpenForDate } from '../db/metalDayClosing'
import { assertCategoryExists } from '../db/stockCategories'
import { cancelInward } from '../inwards/cancel'
import { applyInwardStock } from '../inwards/finalize'
import { inwardNoPrefix, nextInwardNo } from '../inwards/numbering'
import { audit } from '../lib/audit'
import { asyncHandler, parseBody, parseIdParam } from '../lib/http'
import { assertUniqueHuids, parseHuidsJson, stringifyHuids } from '../products/huids'
import { localTodayIso } from '@shared/localDate'
import { computePurchaseTotals } from '@shared/billing/billSummary'
import { computePurchaseLineAmount, DEFAULT_HSN, roundMoney, roundWeight } from '@shared/billing/pricing'

const router = Router()

type InwardRow = {
  id: number
  supplier_id: number
  supplier_name: string
  supplier_phone: string
  supplier_address: string
  supplier_gstin: string
  inward_no: string
  supplier_invoice_no: string | null
  inward_date: string
  status: InwardStatus
  payment_mode: string
  subtotal: number
  discount: number | null
  cgst: number
  sgst: number
  igst: number
  gst_mode: string | null
  round_off: number
  total: number
  notes: string
  source: string | null
  created_at: string
  finalized_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
}

type InwardItemRow = {
  id: number
  inward_id: number
  product_id: number | null
  product_name: string | null
  metal: string
  category: string
  purity: string
  qty: number
  gross_weight: number
  net_weight: number
  rate: number
  making_charges: number
  hsn_code: string
  line_total: number
  huids: string | null
  pieces: string | null
}

function mapPaymentMode(value: string | null | undefined): PurchasePaymentMode {
  if (value === 'upi' || value === 'card') return value
  return 'cash'
}

function mapGstMode(value: string | null | undefined): PurchaseGstMode {
  if (value === 'intra' || value === 'inter') return value
  return 'none'
}

function mapInwardSource(value: string | null | undefined): InwardSource {
  return value === 'stock_add' ? 'stock_add' : 'purchase'
}

function mapStatus(value: string | null | undefined): InwardStatus {
  if (value === 'final' || value === 'cancelled') return value
  return 'draft'
}

function mapItem(row: InwardItemRow): InwardItem {
  return {
    id: row.id,
    inwardId: row.inward_id,
    productId: row.product_id,
    productName: row.product_name,
    metal: row.metal,
    category: row.category,
    purity: row.purity,
    qty: row.qty,
    grossWeight: row.gross_weight ?? 0,
    netWeight: row.net_weight,
    rate: row.rate,
    makingCharges: row.making_charges ?? 0,
    hsnCode: row.hsn_code || DEFAULT_HSN,
    lineTotal: row.line_total,
    huids: parseHuidsJson(row.huids),
    pieces: parsePiecesJson(row.pieces),
  }
}

function parsePiecesJson(raw: string | null | undefined): InwardPieceInput[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
      .map((value) => ({
        tagCode: typeof value.tagCode === 'string' ? value.tagCode : '',
        huid: typeof value.huid === 'string' ? value.huid.toUpperCase() : '',
        grossWeight: Number(value.grossWeight) || 0,
        stoneWeight: Number(value.stoneWeight) || 0,
        netWeight: Number(value.netWeight) || 0,
      }))
      .filter((piece) => piece.netWeight > 0)
  } catch {
    return []
  }
}

function stringifyPieces(pieces: InwardPieceInput[] | undefined): string {
  return JSON.stringify(
    (pieces ?? [])
      .filter((piece) => piece.netWeight > 0)
      .map((piece) => ({
        tagCode: (piece.tagCode ?? '').trim().toUpperCase(),
        huid: (piece.huid ?? '').trim().toUpperCase(),
        grossWeight: piece.grossWeight ?? 0,
        stoneWeight: piece.stoneWeight ?? 0,
        netWeight: piece.netWeight,
      })),
  )
}

function loadItems(db: ReturnType<typeof getDatabase>, inwardId: number): InwardItem[] {
  const rows = db
    .prepare(
      `SELECT ii.*, p.name AS product_name
       FROM inward_items ii
       LEFT JOIN products p ON p.id = ii.product_id
       WHERE ii.inward_id = ?
       ORDER BY ii.id`,
    )
    .all(inwardId) as InwardItemRow[]
  return rows.map(mapItem)
}

function loadAllItemsByInward(db: ReturnType<typeof getDatabase>): Map<number, InwardItem[]> {
  const rows = db
    .prepare(
      `SELECT ii.*, p.name AS product_name
       FROM inward_items ii
       LEFT JOIN products p ON p.id = ii.product_id
       ORDER BY ii.inward_id, ii.id`,
    )
    .all() as InwardItemRow[]
  const byInward = new Map<number, InwardItem[]>()
  for (const row of rows) {
    const list = byInward.get(row.inward_id)
    if (list) {
      list.push(mapItem(row))
    } else {
      byInward.set(row.inward_id, [mapItem(row)])
    }
  }
  return byInward
}

function getInwardRow(db: ReturnType<typeof getDatabase>, id: number): InwardRow {
  const row = db
    .prepare(
      `SELECT i.*, s.name AS supplier_name, s.phone AS supplier_phone,
              s.address AS supplier_address, s.gstin AS supplier_gstin
       FROM inwards i
       JOIN suppliers s ON s.id = i.supplier_id
       WHERE i.id = ?`,
    )
    .get(id) as InwardRow | undefined
  if (!row) {
    throw new Error('Inward not found')
  }
  return row
}

function mapInward(db: ReturnType<typeof getDatabase>, row: InwardRow, items?: InwardItem[]): Inward {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierPhone: row.supplier_phone ?? '',
    supplierAddress: row.supplier_address ?? '',
    supplierGstin: row.supplier_gstin ?? '',
    inwardNo: row.inward_no,
    supplierInvoiceNo: row.supplier_invoice_no ?? '',
    inwardDate: row.inward_date,
    status: mapStatus(row.status),
    paymentMode: mapPaymentMode(row.payment_mode),
    subtotal: row.subtotal,
    discount: row.discount ?? 0,
    taxable: roundMoney(row.subtotal - (row.discount ?? 0)),
    cgst: row.cgst ?? 0,
    sgst: row.sgst ?? 0,
    igst: row.igst ?? 0,
    gstMode: mapGstMode(row.gst_mode),
    roundOff: row.round_off ?? 0,
    total: row.total,
    notes: row.notes,
    source: mapInwardSource(row.source),
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason ?? '',
    items: items ?? loadItems(db, row.id),
  }
}

function assertDraft(db: ReturnType<typeof getDatabase>, id: number): void {
  const row = db.prepare('SELECT status FROM inwards WHERE id = ?').get(id) as
    | { status: string }
    | undefined
  if (!row) {
    throw new Error('Inward not found')
  }
  if (row.status !== 'draft') {
    throw new Error('Only draft inwards can be modified')
  }
}

function requireSupplier(db: ReturnType<typeof getDatabase>, supplierId: number): void {
  const row = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(supplierId)
  if (!row) {
    throw new Error('Supplier not found')
  }
}

function replaceItems(
  db: ReturnType<typeof getDatabase>,
  inwardId: number,
  items: InwardItemInput[],
): { lineAmounts: number[] } {
  db.prepare('DELETE FROM inward_items WHERE inward_id = ?').run(inwardId)
  const insert = db.prepare(
    `INSERT INTO inward_items (
       inward_id, product_id, metal, category, purity, qty, gross_weight, net_weight, rate,
       making_charges, hsn_code, line_total, huids, pieces
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const lineAmounts: number[] = []
  const huidsOnInward = new Set<string>()
  for (const item of items) {
    let metal = item.metal.trim()
    let category = item.category.trim()
    let purity = item.purity ?? ''
    let tracked = false
    if (item.productId != null) {
      const product = db
        .prepare('SELECT id, metal, category, purity, track_pieces FROM products WHERE id = ?')
        .get(item.productId) as
        | { id: number; metal: string; category: string; purity: string; track_pieces: number }
        | undefined
      if (!product) {
        throw new Error(`Product ${item.productId} not found`)
      }
      if (
        metal.toLowerCase() !== product.metal.trim().toLowerCase() ||
        category.toLowerCase() !== product.category.trim().toLowerCase()
      ) {
        throw new Error('Inward line metal and category must match the selected product')
      }
      metal = product.metal
      category = product.category
      purity = purity || product.purity
      tracked = product.track_pieces === 1
    }

    let pieces = (item.pieces ?? []).filter((piece) => piece.netWeight > 0)
    if (pieces.length > 0 && !tracked) {
      throw new Error('Piece rows are only allowed on products that track each piece')
    }
    if (tracked && pieces.length === 0) {
      // A tracked line saved without rows still creates one piece per quantity so
      // a draft round-trips through the same model the editor shows.
      pieces = Array.from({ length: item.qty }, (_, index) => ({
        tagCode: '',
        huid: (item.huids ?? [])[index] ?? '',
        grossWeight: item.grossWeight || item.netWeight,
        stoneWeight: 0,
        netWeight: item.netWeight,
      }))
    }
    if (pieces.length > 0 && pieces.length !== item.qty) {
      throw new Error('Quantity must equal the number of piece rows')
    }

    const storedHuids =
      pieces.length > 0
        ? pieces.map((piece) => (piece.huid ?? '').trim().toUpperCase()).filter(Boolean)
        : (item.huids ?? [])
    if (item.productId != null) {
      for (const huid of storedHuids) {
        if (huidsOnInward.has(huid)) {
          throw new Error(`HUID ${huid} is used on more than one line`)
        }
        huidsOnInward.add(huid)
      }
      assertUniqueHuids(db, storedHuids)
    }

    const pieceNetTotal = pieces.reduce((sum, piece) => sum + piece.netWeight, 0)
    const storedNetWeight =
      pieces.length > 0 ? roundWeight(pieceNetTotal / pieces.length) : item.netWeight
    assertCategoryExists(db, category)
    const amount =
      pieces.length > 0
        ? roundMoney(pieceNetTotal * item.rate + (item.makingCharges ?? 0) * pieces.length)
        : computePurchaseLineAmount({
            qty: item.qty,
            netWeight: item.netWeight,
            rate: item.rate,
            makingCharges: item.makingCharges ?? 0,
          })
    lineAmounts.push(amount)
    insert.run(
      inwardId,
      item.productId ?? null,
      metal,
      category,
      purity,
      item.qty,
      pieces.length > 0
        ? roundWeight(pieces.reduce((sum, piece) => sum + (piece.grossWeight || piece.netWeight), 0) / pieces.length)
        : (item.grossWeight ?? 0),
      storedNetWeight,
      item.rate,
      item.makingCharges ?? 0,
      item.hsnCode?.trim() || DEFAULT_HSN,
      amount,
      stringifyHuids(item.productId != null ? storedHuids : []),
      stringifyPieces(item.productId != null ? pieces : []),
    )
  }
  return { lineAmounts }
}

/**
 * A supplier invoice number must be unique per supplier among purchases that
 * still count (drafts and finalized). Cancelled purchases are ignored.
 */
function assertUniqueSupplierInvoice(
  db: ReturnType<typeof getDatabase>,
  supplierId: number,
  supplierInvoiceNo: string,
  excludeId?: number,
): void {
  const invoiceNo = supplierInvoiceNo.trim()
  if (!invoiceNo) return
  const existing = db
    .prepare(
      `SELECT inward_no FROM inwards
       WHERE supplier_id = ?
         AND lower(trim(supplier_invoice_no)) = lower(trim(?))
         AND status != 'cancelled'
         AND (? IS NULL OR id != ?)
       LIMIT 1`,
    )
    .get(supplierId, invoiceNo, excludeId ?? null, excludeId ?? null) as
    | { inward_no: string }
    | undefined
  if (existing) {
    throw new Error(`Supplier invoice ${invoiceNo} is already recorded on ${existing.inward_no}`)
  }
}

function applyPurchaseTotals(
  db: ReturnType<typeof getDatabase>,
  inwardId: number,
  input: InwardInput,
  lineAmounts: number[],
): void {
  const totals = computePurchaseTotals(lineAmounts, input.roundOff, {
    discount: input.discount ?? 0,
    gstMode: input.gstMode ?? 'none',
  })
  const paymentMode = mapPaymentMode(input.paymentMode)
  const gstMode = mapGstMode(input.gstMode)
  db.prepare(
    `UPDATE inwards
     SET supplier_id = ?, supplier_invoice_no = ?, inward_date = ?, notes = ?, payment_mode = ?,
         discount = ?, gst_mode = ?, subtotal = ?, cgst = ?, sgst = ?, igst = ?, round_off = ?,
         total = ?
     WHERE id = ?`,
  ).run(
    input.supplierId,
    (input.supplierInvoiceNo ?? '').trim(),
    input.inwardDate,
    input.notes ?? '',
    paymentMode,
    totals.discount,
    gstMode,
    totals.subtotal,
    totals.cgst,
    totals.sgst,
    totals.igst,
    totals.roundOff,
    totals.total,
    inwardId,
  )
}

function saveDraftInward(
  db: ReturnType<typeof getDatabase>,
  input: InwardInput,
  existingId?: number,
): Inward {
  requireSupplier(db, input.supplierId)
  assertUniqueSupplierInvoice(db, input.supplierId, input.supplierInvoiceNo ?? '', existingId)

  if (existingId != null) {
    assertDraft(db, existingId)
    const current = db.prepare('SELECT inward_no FROM inwards WHERE id = ?').get(existingId) as {
      inward_no: string
    }
    if (!current.inward_no.startsWith(inwardNoPrefix(input.inwardDate))) {
      db.prepare('UPDATE inwards SET inward_no = ? WHERE id = ?').run(
        nextInwardNo(db, input.inwardDate),
        existingId,
      )
    }
    const { lineAmounts } = replaceItems(db, existingId, input.items)
    applyPurchaseTotals(db, existingId, input, lineAmounts)
    return mapInward(db, getInwardRow(db, existingId))
  }

  const inwardNo = nextInwardNo(db, input.inwardDate)
  const result = db
    .prepare(
      `INSERT INTO inwards (
         supplier_id, supplier_invoice_no, inward_no, inward_date, status, subtotal, total, notes,
         payment_mode, created_at
       ) VALUES (?, ?, ?, ?, 'draft', 0, 0, ?, ?, datetime('now'))`,
    )
    .run(
      input.supplierId,
      (input.supplierInvoiceNo ?? '').trim(),
      inwardNo,
      input.inwardDate,
      input.notes ?? '',
      mapPaymentMode(input.paymentMode),
    )
  const id = Number(result.lastInsertRowid)
  const { lineAmounts } = replaceItems(db, id, input.items)
  applyPurchaseTotals(db, id, input, lineAmounts)
  return mapInward(db, getInwardRow(db, id))
}

router.get(
  '/',
  asyncHandler((_req, res) => {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT i.*, s.name AS supplier_name, s.phone AS supplier_phone,
                s.address AS supplier_address, s.gstin AS supplier_gstin
         FROM inwards i
         JOIN suppliers s ON s.id = i.supplier_id
         ORDER BY i.inward_date DESC, i.id DESC`,
      )
      .all() as InwardRow[]
    const itemsByInward = loadAllItemsByInward(db)
    res.json(rows.map((row) => mapInward(db, row, itemsByInward.get(row.id) ?? [])))
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    res.json(mapInward(db, getInwardRow(db, id)))
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(inwardInputSchema, req.body) as InwardInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const saved = saveDraftInward(db, input)
      audit(db, {
        entityType: 'inward',
        entityId: saved.id,
        action: 'create',
        after: saved,
        operatorId: req.user?.id ?? null,
      })
      return saved
    })
    res.status(201).json(tx())
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(inwardUpdateInputSchema, { ...req.body, id }) as InwardUpdateInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const before = mapInward(db, getInwardRow(db, id))
      const saved = saveDraftInward(
        db,
        {
          supplierId: input.supplierId,
          supplierInvoiceNo: input.supplierInvoiceNo,
          inwardDate: input.inwardDate,
          notes: input.notes,
          paymentMode: input.paymentMode,
          discount: input.discount,
          gstMode: input.gstMode,
          roundOff: input.roundOff,
          items: input.items,
        },
        input.id,
      )
      audit(db, {
        entityType: 'inward',
        entityId: saved.id,
        action: 'update',
        before,
        after: saved,
        operatorId: req.user?.id ?? null,
      })
      return saved
    })
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
      const before = mapInward(db, getInwardRow(db, id))
      const row = getInwardRow(db, id)
      // Two drafts could have been saved before either was finalized; only the
      // first one may claim the supplier invoice number.
      assertUniqueSupplierInvoice(db, row.supplier_id, row.supplier_invoice_no ?? '', id)
      const items = loadItems(db, id)
      assertMetalsOpenForDate(
        db,
        row.inward_date,
        items.map((item) => item.metal),
      )
      applyInwardStock(db, {
        inwardId: id,
        inwardDate: row.inward_date,
        items,
        operatorId: req.user?.id ?? null,
        discount: row.discount ?? 0,
        subtotal: row.subtotal,
      })
      const after = mapInward(db, getInwardRow(db, id))
      audit(db, {
        entityType: 'inward',
        entityId: id,
        action: 'finalize',
        before,
        after,
        operatorId: req.user?.id ?? null,
      })
      return after
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/cancel',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(inwardCancelInputSchema, req.body)
    const db = getDatabase()
    const tx = db.transaction(() => {
      const before = mapInward(db, getInwardRow(db, id))
      cancelInward(db, {
        inwardId: id,
        reason: input.reason,
        operatorId: req.user?.id ?? null,
      })
      const after = mapInward(db, getInwardRow(db, id))
      audit(db, {
        entityType: 'inward',
        entityId: id,
        action: 'cancel',
        before,
        after,
        operatorId: req.user?.id ?? null,
      })
      return after
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/copy',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const tx = db.transaction(() => {
      const source = mapInward(db, getInwardRow(db, id))
      if (source.status === 'draft') {
        throw new Error('Only a finalized or cancelled purchase can be copied')
      }
      const copy = saveDraftInward(db, {
        supplierId: source.supplierId,
        supplierInvoiceNo: '',
        inwardDate: localTodayIso(),
        notes: source.notes,
        paymentMode: source.paymentMode,
        discount: source.discount,
        gstMode: source.gstMode,
        items: source.items.map((item) => ({
          productId: item.productId,
          metal: item.metal,
          category: item.category,
          purity: item.purity,
          qty: item.qty,
          grossWeight: item.grossWeight,
          netWeight: item.netWeight,
          rate: item.rate,
          makingCharges: item.makingCharges,
          hsnCode: item.hsnCode,
          // Tags and HUIDs stay on the original pieces, including reversed ones,
          // so the replacement draft keeps the weights and gets fresh tags.
          huids: [],
          pieces: (item.pieces ?? []).map((piece) => ({
            tagCode: '',
            huid: '',
            grossWeight: piece.grossWeight,
            stoneWeight: piece.stoneWeight,
            netWeight: piece.netWeight,
          })),
        })),
      })
      audit(db, {
        entityType: 'inward',
        entityId: copy.id,
        action: 'create',
        after: copy,
        operatorId: req.user?.id ?? null,
      })
      return copy
    })
    res.status(201).json(tx())
  }),
)

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    assertDraft(db, id)
    const result = db.prepare('DELETE FROM inwards WHERE id = ?').run(id)
    if (result.changes === 0) {
      throw new Error('Inward not found')
    }
    res.status(204).end()
  }),
)

export default router
