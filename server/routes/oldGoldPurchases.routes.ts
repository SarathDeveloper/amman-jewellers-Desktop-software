import { Router } from 'express'
import { oldGoldPurchaseInputSchema, oldGoldPurchaseUpdateInputSchema } from '@shared/schemas'
import { computeOldGoldValue } from '@shared/billing/billSummary'
import { roundMoney } from '@shared/billing/pricing'
import type {
  OldGoldPurchase,
  OldGoldPurchaseInput,
  OldGoldPurchaseItem,
  OldGoldPurchaseItemInput,
  OldGoldPurchaseUpdateInput,
} from '@shared/types'
import { getDatabase } from '../db'
import { asyncHandler, parseBody, parseIdParam } from '../lib/http'
import { requireFeature } from '../auth/middleware'

const router = Router()

type PurchaseRow = {
  id: number
  purchase_no: string
  purchase_date: string
  customer_id: number | null
  customer_name: string
  customer_phone: string
  total_amount: number
  notes: string
  status: 'draft' | 'final'
  created_at: string
  finalized_at: string | null
  linked_invoice_id: number | null
  linked_invoice_no: string | null
}

type ItemRow = {
  id: number
  purchase_id: number
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
}

function nextPurchaseNo(db: ReturnType<typeof getDatabase>): string {
  const year = new Date().getFullYear()
  const prefix = `OGP-${year}-`
  const last = db
    .prepare(
      `SELECT purchase_no FROM old_gold_purchases WHERE purchase_no LIKE ? ORDER BY purchase_no DESC LIMIT 1`,
    )
    .get(`${prefix}%`) as { purchase_no: string } | undefined
  const lastSeq = last ? Number.parseInt(last.purchase_no.replace(prefix, ''), 10) : 0
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

function mapItem(row: ItemRow): OldGoldPurchaseItem {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
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
  }
}

function loadItems(db: ReturnType<typeof getDatabase>, purchaseId: number): OldGoldPurchaseItem[] {
  const rows = db
    .prepare(
      `SELECT id, purchase_id, description, gross_weight, stone_weight, net_weight, purity,
              rate_per_gram, deduction_pct, gross_value, deduction_amount, final_value
       FROM old_gold_purchase_items
       WHERE purchase_id = ?
       ORDER BY id`,
    )
    .all(purchaseId) as ItemRow[]
  return rows.map(mapItem)
}

const purchaseSelect = `
  SELECT p.*,
         l.invoice_id AS linked_invoice_id,
         i.invoice_no AS linked_invoice_no
  FROM old_gold_purchases p
  LEFT JOIN invoice_old_gold_links l ON l.purchase_id = p.id
  LEFT JOIN invoices i ON i.id = l.invoice_id
`

function getPurchaseRow(db: ReturnType<typeof getDatabase>, id: number): PurchaseRow {
  const row = db.prepare(`${purchaseSelect} WHERE p.id = ?`).get(id) as PurchaseRow | undefined
  if (!row) {
    throw new Error('Old gold purchase not found')
  }
  return row
}

function mapPurchase(db: ReturnType<typeof getDatabase>, row: PurchaseRow): OldGoldPurchase {
  return {
    id: row.id,
    purchaseNo: row.purchase_no,
    purchaseDate: row.purchase_date,
    customerId: row.customer_id,
    customerName: row.customer_name ?? '',
    customerPhone: row.customer_phone ?? '',
    totalAmount: row.total_amount,
    notes: row.notes ?? '',
    status: row.status,
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
    items: loadItems(db, row.id),
    linkedInvoiceId: row.linked_invoice_id,
    linkedInvoiceNo: row.linked_invoice_no,
  }
}

function assertDraft(db: ReturnType<typeof getDatabase>, id: number): void {
  const row = db.prepare('SELECT status FROM old_gold_purchases WHERE id = ?').get(id) as
    | { status: string }
    | undefined
  if (!row) {
    throw new Error('Old gold purchase not found')
  }
  if (row.status !== 'draft') {
    throw new Error('Only draft old gold purchases can be modified')
  }
}

function requireCustomerIfSet(db: ReturnType<typeof getDatabase>, customerId: number | null | undefined): void {
  if (customerId == null) return
  const row = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId)
  if (!row) {
    throw new Error('Customer not found')
  }
}

function replaceItems(
  db: ReturnType<typeof getDatabase>,
  purchaseId: number,
  items: OldGoldPurchaseItemInput[],
): number {
  db.prepare('DELETE FROM old_gold_purchase_items WHERE purchase_id = ?').run(purchaseId)
  const insert = db.prepare(
    `INSERT INTO old_gold_purchase_items (
       purchase_id, description, gross_weight, stone_weight, net_weight, purity,
       rate_per_gram, deduction_pct, gross_value, deduction_amount, final_value
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  let total = 0
  for (const item of items) {
    const stoneWeight = item.stoneWeight ?? 0
    const netWeight = item.netWeight > 0 ? item.netWeight : Math.max(0, item.grossWeight - stoneWeight)
    const priced = computeOldGoldValue({
      netWeight,
      ratePerGram: item.ratePerGram,
      deductionPct: item.deductionPct,
    })
    insert.run(
      purchaseId,
      item.description?.trim() || 'Old gold',
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
    total += priced.finalValue
  }
  return roundMoney(total)
}

function saveDraftPurchase(
  db: ReturnType<typeof getDatabase>,
  input: OldGoldPurchaseInput,
  existingId?: number,
): OldGoldPurchase {
  requireCustomerIfSet(db, input.customerId)
  const customerName = input.customerName.trim()
  const customerPhone = (input.customerPhone ?? '').trim()
  const notes = input.notes ?? ''

  if (existingId) {
    assertDraft(db, existingId)
    const total = replaceItems(db, existingId, input.items)
    db.prepare(
      `UPDATE old_gold_purchases SET
         purchase_date = ?, customer_id = ?, customer_name = ?, customer_phone = ?,
         total_amount = ?, notes = ?
       WHERE id = ?`,
    ).run(
      input.purchaseDate,
      input.customerId ?? null,
      customerName,
      customerPhone,
      total,
      notes,
      existingId,
    )
    return mapPurchase(db, getPurchaseRow(db, existingId))
  }

  const purchaseNo = nextPurchaseNo(db)
  const result = db
    .prepare(
      `INSERT INTO old_gold_purchases (
         purchase_no, purchase_date, customer_id, customer_name, customer_phone,
         total_amount, notes, status, created_at
       ) VALUES (?, ?, ?, ?, ?, 0, ?, 'draft', datetime('now'))`,
    )
    .run(purchaseNo, input.purchaseDate, input.customerId ?? null, customerName, customerPhone, notes)
  const id = Number(result.lastInsertRowid)
  const total = replaceItems(db, id, input.items)
  db.prepare('UPDATE old_gold_purchases SET total_amount = ? WHERE id = ?').run(total, id)
  return mapPurchase(db, getPurchaseRow(db, id))
}

router.get(
  '/next-purchase-no',
  asyncHandler((_req, res) => {
    const db = getDatabase()
    res.json({ purchaseNo: nextPurchaseNo(db) })
  }),
)

router.get(
  '/by-no/:purchaseNo',
  asyncHandler((req, res) => {
    const raw = String(req.params.purchaseNo ?? '').trim()
    if (!raw) {
      throw new Error('Enter an old gold purchase bill number')
    }
    const db = getDatabase()
    const year = new Date().getFullYear()
    const candidates = [raw, raw.toUpperCase()]
    if (/^\d+$/.test(raw)) {
      candidates.push(`OGP-${year}-${raw.padStart(4, '0')}`)
    }
    const unique = [...new Set(candidates)]
    const placeholders = unique.map(() => 'UPPER(p.purchase_no) = UPPER(?)').join(' OR ')
    const row = db
      .prepare(`${purchaseSelect} WHERE ${placeholders} ORDER BY p.id DESC LIMIT 1`)
      .get(...unique) as PurchaseRow | undefined
    if (!row) {
      throw new Error(`Old gold purchase ${raw} not found`)
    }
    if (row.status !== 'final') {
      throw new Error(`${row.purchase_no} is still a draft. Finalize it before applying to a sale bill.`)
    }
    res.json(mapPurchase(db, row))
  }),
)

router.get(
  '/',
  asyncHandler((_req, res) => {
    const db = getDatabase()
    const rows = db
      .prepare(`${purchaseSelect} ORDER BY p.purchase_date DESC, p.id DESC`)
      .all() as PurchaseRow[]
    res.json(rows.map((row) => mapPurchase(db, row)))
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    res.json(mapPurchase(db, getPurchaseRow(db, id)))
  }),
)

router.post(
  '/',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const input = parseBody(oldGoldPurchaseInputSchema, req.body) as OldGoldPurchaseInput
    const db = getDatabase()
    const tx = db.transaction(() => saveDraftPurchase(db, input))
    res.status(201).json(tx())
  }),
)

router.put(
  '/:id',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(oldGoldPurchaseUpdateInputSchema, { ...req.body, id }) as OldGoldPurchaseUpdateInput
    const db = getDatabase()
    const tx = db.transaction(() => saveDraftPurchase(db, input, input.id))
    res.json(tx())
  }),
)

router.post(
  '/:id/finalize',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const tx = db.transaction(() => {
      assertDraft(db, id)
      const row = getPurchaseRow(db, id)
      if (row.total_amount <= 0) {
        throw new Error('Add at least one old gold item before finalizing')
      }
      db.prepare(
        `UPDATE old_gold_purchases SET status = 'final', finalized_at = datetime('now') WHERE id = ?`,
      ).run(id)
      return mapPurchase(db, getPurchaseRow(db, id))
    })
    res.json(tx())
  }),
)

router.delete(
  '/:id',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    assertDraft(db, id)
    const result = db.prepare('DELETE FROM old_gold_purchases WHERE id = ?').run(id)
    if (result.changes === 0) {
      throw new Error('Old gold purchase not found')
    }
    res.status(204).end()
  }),
)

export default router
