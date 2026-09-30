import { Router } from 'express'
import { inwardInputSchema, inwardUpdateInputSchema } from '@shared/schemas'
import type {
  Inward,
  InwardInput,
  InwardItem,
  InwardItemInput,
  InwardUpdateInput,
  PurchasePaymentMode,
} from '@shared/types'
import { getDatabase } from '../db'
import { assertMetalsOpenForDate } from '../db/metalDayClosing'
import { assertCategoryExists } from '../db/stockCategories'
import { asyncHandler, parseBody, parseIdParam } from '../lib/http'
import { recordPieceMovement, recordWeightMovement } from '../stock/movements'
import { computePurchaseTotals } from '@shared/billing/billSummary'
import { computePurchaseLineAmount, DEFAULT_HSN } from '@shared/billing/pricing'

const router = Router()

type InwardRow = {
  id: number
  supplier_id: number
  supplier_name: string
  supplier_phone: string
  supplier_address: string
  supplier_gstin: string
  inward_no: string
  inward_date: string
  status: 'draft' | 'final'
  payment_mode: string
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  round_off: number
  total: number
  notes: string
  created_at: string
  finalized_at: string | null
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
}

function mapPaymentMode(value: string | null | undefined): PurchasePaymentMode {
  if (value === 'upi' || value === 'card') return value
  return 'cash'
}

function nextInwardNo(db: ReturnType<typeof getDatabase>): string {
  const year = new Date().getFullYear()
  const prefix = `IN-${year}-`
  const last = db
    .prepare(`SELECT inward_no FROM inwards WHERE inward_no LIKE ? ORDER BY inward_no DESC LIMIT 1`)
    .get(`${prefix}%`) as { inward_no: string } | undefined
  const lastSeq = last ? Number.parseInt(last.inward_no.replace(prefix, ''), 10) : 0
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
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
  }
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

function mapInward(db: ReturnType<typeof getDatabase>, row: InwardRow): Inward {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierPhone: row.supplier_phone ?? '',
    supplierAddress: row.supplier_address ?? '',
    supplierGstin: row.supplier_gstin ?? '',
    inwardNo: row.inward_no,
    inwardDate: row.inward_date,
    status: row.status,
    paymentMode: mapPaymentMode(row.payment_mode),
    subtotal: row.subtotal,
    cgst: row.cgst ?? 0,
    sgst: row.sgst ?? 0,
    igst: row.igst ?? 0,
    roundOff: row.round_off ?? 0,
    total: row.total,
    notes: row.notes,
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
    items: loadItems(db, row.id),
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
       making_charges, hsn_code, line_total
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const lineAmounts: number[] = []
  for (const item of items) {
    let metal = item.metal.trim()
    let category = item.category.trim()
    let purity = item.purity ?? ''
    if (item.productId != null) {
      const product = db
        .prepare('SELECT id, metal, category, purity FROM products WHERE id = ?')
        .get(item.productId) as
        | { id: number; metal: string; category: string; purity: string }
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
    }
    assertCategoryExists(db, category)
    const amount = computePurchaseLineAmount({
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
      item.grossWeight ?? 0,
      item.netWeight,
      item.rate,
      item.makingCharges ?? 0,
      item.hsnCode?.trim() || DEFAULT_HSN,
      amount,
    )
  }
  return { lineAmounts }
}

function applyPurchaseTotals(
  db: ReturnType<typeof getDatabase>,
  inwardId: number,
  input: InwardInput,
  lineAmounts: number[],
): void {
  const totals = computePurchaseTotals(lineAmounts, input.roundOff)
  const paymentMode = mapPaymentMode(input.paymentMode)
  db.prepare(
    `UPDATE inwards
     SET supplier_id = ?, inward_date = ?, notes = ?, payment_mode = ?,
         subtotal = ?, cgst = ?, sgst = ?, igst = ?, round_off = ?, total = ?
     WHERE id = ?`,
  ).run(
    input.supplierId,
    input.inwardDate,
    input.notes ?? '',
    paymentMode,
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

  if (existingId != null) {
    assertDraft(db, existingId)
    const { lineAmounts } = replaceItems(db, existingId, input.items)
    applyPurchaseTotals(db, existingId, input, lineAmounts)
    return mapInward(db, getInwardRow(db, existingId))
  }

  const inwardNo = nextInwardNo(db)
  const result = db
    .prepare(
      `INSERT INTO inwards (
         supplier_id, inward_no, inward_date, status, subtotal, total, notes, payment_mode, created_at
       ) VALUES (?, ?, ?, 'draft', 0, 0, ?, ?, datetime('now'))`,
    )
    .run(
      input.supplierId,
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
    res.json(rows.map((row) => mapInward(db, row)))
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
    const tx = db.transaction(() => saveDraftInward(db, input))
    res.status(201).json(tx())
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(inwardUpdateInputSchema, { ...req.body, id }) as InwardUpdateInput
    const db = getDatabase()
    const tx = db.transaction(() =>
      saveDraftInward(
        db,
        {
          supplierId: input.supplierId,
          inwardDate: input.inwardDate,
          notes: input.notes,
          paymentMode: input.paymentMode,
          roundOff: input.roundOff,
          items: input.items,
        },
        input.id,
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
      const row = getInwardRow(db, id)
      const items = loadItems(db, id)
      assertMetalsOpenForDate(
        db,
        row.inward_date,
        items.map((item) => item.metal),
      )

      for (const item of items) {
        if (item.productId == null) {
          const weight = item.netWeight * item.qty
          if (weight <= 0) continue
          recordWeightMovement(db, {
            type: 'purchase',
            metal: item.metal,
            category: item.category,
            weightDelta: weight,
            refType: 'inward',
            refId: id,
            reason: 'Raw metal inward',
            operatorId: req.user?.id ?? null,
            movementDate: row.inward_date,
          })
          continue
        }
        recordPieceMovement(db, {
          type: 'purchase',
          productId: item.productId,
          qtyDelta: item.qty,
          weightDelta: item.netWeight * item.qty,
          refType: 'inward',
          refId: id,
          reason: 'Inward finalize',
          operatorId: req.user?.id ?? null,
          movementDate: row.inward_date,
        })
      }

      db.prepare(
        `UPDATE inwards SET status = 'final', finalized_at = datetime('now') WHERE id = ?`,
      ).run(id)
      return mapInward(db, getInwardRow(db, id))
    })
    res.json(tx())
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
