import { Router } from 'express'
import {
  oldGoldPurchaseInputSchema,
  oldGoldPurchaseUpdateInputSchema,
  oldGoldPurchaseCancelInputSchema,
  oldGoldPayoutInputSchema,
  oldGoldPayoutVoidInputSchema,
} from '@shared/schemas'
import { computeOldGoldValue } from '@shared/billing/billSummary'
import { roundMoney } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import type {
  OldGoldPurchase,
  OldGoldPurchaseInput,
  OldGoldPurchaseItem,
  OldGoldPurchaseItemInput,
  OldGoldPurchaseUpdateInput,
  OldGoldPurchaseBillLink,
  OldGoldPurchasePayout,
  OldGoldPayoutInput,
  OldGoldPayoutMode,
} from '@shared/types'
import { getDatabase } from '../db'
import { asyncHandler, parseBody, parseIdParam, queryString } from '../lib/http'
import { requireAnyFeature, requireFeature } from '../auth/middleware'

const router = Router()

type Db = ReturnType<typeof getDatabase>

type PurchaseRow = {
  id: number
  purchase_no: string
  purchase_date: string
  customer_id: number | null
  customer_name: string
  customer_phone: string
  total_amount: number
  notes: string
  status: 'draft' | 'final' | 'cancelled'
  created_at: string
  finalized_at: string | null
  cancelled_at: string | null
  cancel_reason: string
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
  touch_pct: number
  fine_weight: number
  metal: string
  gross_value: number
  deduction_amount: number
  final_value: number
}

type LinkRow = {
  purchase_id: number
  invoice_id: number
  invoice_no: string
  invoice_date: string
  status: string
  amount_applied: number
}

type PayoutRow = {
  id: number
  purchase_id: number
  payout_date: string
  amount: number
  mode: string
  note: string
  invoice_id: number | null
  invoice_no: string | null
  created_at: string
  voided_at: string | null
  void_reason: string
}

function yearFromDate(date: string): number {
  const year = Number.parseInt(date.slice(0, 4), 10)
  return Number.isFinite(year) && year > 0 ? year : new Date().getFullYear()
}

function nextPurchaseNo(db: Db, purchaseDate: string): string {
  const prefix = `OGP-${yearFromDate(purchaseDate)}-`
  const rows = db
    .prepare('SELECT purchase_no FROM old_gold_purchases WHERE purchase_no LIKE ?')
    .all(`${prefix}%`) as Array<{ purchase_no: string }>
  const max = rows.reduce((current, row) => {
    const value = Number.parseInt(row.purchase_no.slice(prefix.length), 10)
    return Number.isFinite(value) ? Math.max(current, value) : current
  }, 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
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
    touchPct: row.touch_pct ?? 0,
    fineWeight: row.fine_weight ?? 0,
    metal: row.metal ?? 'Gold',
    grossValue: row.gross_value,
    deductionAmount: row.deduction_amount,
    finalValue: row.final_value,
  }
}

function loadItems(db: Db, purchaseId: number): OldGoldPurchaseItem[] {
  const rows = db
    .prepare(
      `SELECT id, purchase_id, description, gross_weight, stone_weight, net_weight, purity,
              rate_per_gram, deduction_pct, touch_pct, fine_weight, metal,
              gross_value, deduction_amount, final_value
       FROM old_gold_purchase_items
       WHERE purchase_id = ?
       ORDER BY id`,
    )
    .all(purchaseId) as ItemRow[]
  return rows.map(mapItem)
}

function loadItemsFor(db: Db, purchaseIds: number[]): Map<number, OldGoldPurchaseItem[]> {
  const result = new Map<number, OldGoldPurchaseItem[]>()
  if (purchaseIds.length === 0) return result
  const placeholders = purchaseIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT id, purchase_id, description, gross_weight, stone_weight, net_weight, purity,
              rate_per_gram, deduction_pct, touch_pct, fine_weight, metal,
              gross_value, deduction_amount, final_value
       FROM old_gold_purchase_items
       WHERE purchase_id IN (${placeholders})
       ORDER BY id`,
    )
    .all(...purchaseIds) as ItemRow[]
  for (const row of rows) {
    const list = result.get(row.purchase_id) ?? []
    list.push(mapItem(row))
    result.set(row.purchase_id, list)
  }
  return result
}

function mapLink(row: LinkRow): OldGoldPurchaseBillLink {
  return {
    invoiceId: row.invoice_id,
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    invoiceStatus: row.status,
    amount: row.amount_applied,
  }
}

function loadLinksFor(db: Db, purchaseIds: number[]): Map<number, OldGoldPurchaseBillLink[]> {
  const result = new Map<number, OldGoldPurchaseBillLink[]>()
  if (purchaseIds.length === 0) return result
  const placeholders = purchaseIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT l.purchase_id, l.invoice_id, l.amount_applied,
              i.invoice_no, i.invoice_date, i.status
       FROM invoice_old_gold_links l
       JOIN invoices i ON i.id = l.invoice_id
       WHERE l.purchase_id IN (${placeholders})
       ORDER BY l.id`,
    )
    .all(...purchaseIds) as LinkRow[]
  for (const row of rows) {
    const list = result.get(row.purchase_id) ?? []
    list.push(mapLink(row))
    result.set(row.purchase_id, list)
  }
  return result
}

function mapPayout(row: PayoutRow): OldGoldPurchasePayout {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    payoutDate: row.payout_date,
    amount: row.amount,
    mode: row.mode as OldGoldPayoutMode,
    note: row.note ?? '',
    invoiceId: row.invoice_id,
    invoiceNo: row.invoice_no,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason ?? '',
  }
}

function loadPayoutsFor(db: Db, purchaseIds: number[]): Map<number, OldGoldPurchasePayout[]> {
  const result = new Map<number, OldGoldPurchasePayout[]>()
  if (purchaseIds.length === 0) return result
  const placeholders = purchaseIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT p.id, p.purchase_id, p.payout_date, p.amount, p.mode, p.note,
              p.invoice_id, i.invoice_no, p.created_at, p.voided_at, p.void_reason
       FROM old_gold_payouts p
       LEFT JOIN invoices i ON i.id = p.invoice_id
       WHERE p.purchase_id IN (${placeholders})
       ORDER BY p.id`,
    )
    .all(...purchaseIds) as PayoutRow[]
  for (const row of rows) {
    const list = result.get(row.purchase_id) ?? []
    list.push(mapPayout(row))
    result.set(row.purchase_id, list)
  }
  return result
}

function mapPurchase(
  row: PurchaseRow,
  items: OldGoldPurchaseItem[],
  links: OldGoldPurchaseBillLink[],
  payouts: OldGoldPurchasePayout[],
): OldGoldPurchase {
  const totalAmount = roundMoney(row.total_amount)
  const paidOut = roundMoney(
    payouts.filter((payout) => payout.voidedAt == null).reduce((sum, payout) => sum + payout.amount, 0),
  )
  const applied = roundMoney(links.reduce((sum, link) => sum + link.amount, 0))
  const firstLink = links[0] ?? null
  return {
    id: row.id,
    purchaseNo: row.purchase_no,
    purchaseDate: row.purchase_date,
    customerId: row.customer_id,
    customerName: row.customer_name ?? '',
    customerPhone: row.customer_phone ?? '',
    totalAmount,
    notes: row.notes ?? '',
    status: row.status,
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason ?? '',
    items,
    paidOut,
    applied,
    balance: roundMoney(Math.max(0, totalAmount - paidOut - applied)),
    links,
    payouts,
    linkedInvoiceId: firstLink?.invoiceId ?? null,
    linkedInvoiceNo: firstLink?.invoiceNo ?? null,
  }
}

function loadPurchase(db: Db, id: number): OldGoldPurchase {
  const row = db
    .prepare('SELECT * FROM old_gold_purchases WHERE id = ?')
    .get(id) as PurchaseRow | undefined
  if (!row) {
    throw new Error('Old gold purchase not found')
  }
  return mapPurchase(
    row,
    loadItems(db, id),
    loadLinksFor(db, [id]).get(id) ?? [],
    loadPayoutsFor(db, [id]).get(id) ?? [],
  )
}

function assertDraft(db: Db, id: number): void {
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

function assertFinal(row: { status: string; purchase_no: string }): void {
  if (row.status === 'cancelled') {
    throw new Error(`${row.purchase_no} is cancelled`)
  }
  if (row.status !== 'final') {
    throw new Error(`${row.purchase_no} must be finalized first`)
  }
}

function requireCustomerIfSet(db: Db, customerId: number | null | undefined): void {
  if (customerId == null) return
  const row = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId)
  if (!row) {
    throw new Error('Customer not found')
  }
}

function replaceItems(db: Db, purchaseId: number, items: OldGoldPurchaseItemInput[]): number {
  db.prepare('DELETE FROM old_gold_purchase_items WHERE purchase_id = ?').run(purchaseId)
  const insert = db.prepare(
    `INSERT INTO old_gold_purchase_items (
       purchase_id, description, gross_weight, stone_weight, net_weight, purity,
       rate_per_gram, deduction_pct, touch_pct, fine_weight, metal,
       gross_value, deduction_amount, final_value
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  let total = 0
  for (const item of items) {
    const stoneWeight = item.stoneWeight ?? 0
    const netWeight = item.netWeight > 0 ? item.netWeight : Math.max(0, item.grossWeight - stoneWeight)
    const touchPct = item.touchPct ?? 0
    const priced = computeOldGoldValue({
      netWeight,
      ratePerGram: item.ratePerGram,
      deductionPct: item.deductionPct,
      touchPct,
    })
    const metal = item.metal ?? metalForPurity(item.purity ?? '')
    insert.run(
      purchaseId,
      item.description?.trim() || 'Old gold',
      item.grossWeight,
      stoneWeight,
      netWeight,
      item.purity?.trim() || '',
      item.ratePerGram,
      item.deductionPct ?? 0,
      touchPct,
      priced.fineWeight,
      metal,
      priced.grossValue,
      priced.deductionAmount,
      priced.finalValue,
    )
    total += priced.finalValue
  }
  return roundMoney(total)
}

function metalForPurity(purity: string): 'Gold' | 'Silver' {
  const value = purity.toLowerCase()
  return value.includes('925') || value.includes('silver') || value.includes('999') ? 'Silver' : 'Gold'
}

function saveDraftPurchase(db: Db, input: OldGoldPurchaseInput, existingId?: number): OldGoldPurchase {
  requireCustomerIfSet(db, input.customerId)
  const customerName = input.customerName.trim()
  const customerPhone = (input.customerPhone ?? '').trim()
  const notes = input.notes ?? ''

  if (existingId) {
    assertDraft(db, existingId)
    const current = db
      .prepare('SELECT purchase_no, purchase_date FROM old_gold_purchases WHERE id = ?')
      .get(existingId) as { purchase_no: string; purchase_date: string }
    const total = replaceItems(db, existingId, input.items)
    // A draft moved to another year keeps a number that matches its date.
    const year = yearFromDate(input.purchaseDate)
    const purchaseNo =
      yearFromDate(current.purchase_date) === year ? current.purchase_no : nextPurchaseNo(db, input.purchaseDate)
    db.prepare(
      `UPDATE old_gold_purchases SET
         purchase_no = ?, purchase_date = ?, customer_id = ?, customer_name = ?, customer_phone = ?,
         total_amount = ?, notes = ?
       WHERE id = ?`,
    ).run(
      purchaseNo,
      input.purchaseDate,
      input.customerId ?? null,
      customerName,
      customerPhone,
      total,
      notes,
      existingId,
    )
    return loadPurchase(db, existingId)
  }

  const purchaseNo = nextPurchaseNo(db, input.purchaseDate)
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
  return loadPurchase(db, id)
}

function insertPayout(
  db: Db,
  purchaseId: number,
  input: OldGoldPayoutInput,
  operatorId: number | null,
): OldGoldPurchasePayout {
  const result = db
    .prepare(
      `INSERT INTO old_gold_payouts (
         purchase_id, payout_date, amount, mode, note, invoice_id, operator_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      purchaseId,
      input.payoutDate,
      roundMoney(input.amount),
      input.mode ?? 'cash',
      input.note?.trim() ?? '',
      input.invoiceId ?? null,
      operatorId,
    )
  const id = Number(result.lastInsertRowid)
  const payout = (loadPayoutsFor(db, [purchaseId]).get(purchaseId) ?? []).find((row) => row.id === id)
  if (!payout) {
    throw new Error('Payout not found after saving')
  }
  return payout
}

router.get(
  '/next-purchase-no',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const date = queryString(req.query, 'date') || localTodayIso()
    res.json({ purchaseNo: nextPurchaseNo(db, date) })
  }),
)

router.get(
  '/stats',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const date = queryString(req.query, 'date') || localTodayIso()
    const today = db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount
         FROM old_gold_purchases
         WHERE purchase_date = ? AND status IN ('final', 'cancelled')`,
      )
      .get(date) as { count: number; amount: number }
    const weight = db
      .prepare(
        `SELECT COALESCE(SUM(i.net_weight), 0) AS net
         FROM old_gold_purchase_items i
         JOIN old_gold_purchases p ON p.id = i.purchase_id
         WHERE p.purchase_date = ? AND p.status IN ('final', 'cancelled')`,
      )
      .get(date) as { net: number }
    const paidOutToday = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS amount
         FROM old_gold_payouts
         WHERE payout_date = ? AND voided_at IS NULL`,
      )
      .get(date) as { amount: number }
    const open = db
      .prepare(
        `SELECT COALESCE(SUM(
           MAX(0, p.total_amount
             - (SELECT COALESCE(SUM(amount), 0) FROM old_gold_payouts
                WHERE purchase_id = p.id AND voided_at IS NULL)
             - (SELECT COALESCE(SUM(amount_applied), 0) FROM invoice_old_gold_links
                WHERE purchase_id = p.id))
         ), 0) AS balance
         FROM old_gold_purchases p
         WHERE p.status = 'final'`,
      )
      .get() as { balance: number }
    res.json({
      date,
      count: today.count,
      amount: roundMoney(today.amount),
      netWeight: weight.net,
      paidOut: roundMoney(paidOutToday.amount),
      openBalance: roundMoney(open.balance),
    })
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
    const conditions: string[] = []
    const params: unknown[] = []
    for (const candidate of [...new Set([raw, raw.toUpperCase()])]) {
      conditions.push('UPPER(p.purchase_no) = UPPER(?)')
      params.push(candidate)
    }
    if (/^\d+$/.test(raw)) {
      // A bare number matches the sequence in any year, newest first.
      conditions.push("p.purchase_no LIKE 'OGP-%-' || ?")
      params.push(raw.padStart(4, '0'))
    }
    const row = db
      .prepare(
        `SELECT p.* FROM old_gold_purchases p
         WHERE ${conditions.join(' OR ')}
         ORDER BY p.id DESC LIMIT 1`,
      )
      .get(...params) as PurchaseRow | undefined
    if (!row) {
      throw new Error(`Old gold purchase ${raw} not found`)
    }
    if (row.status === 'cancelled') {
      throw new Error(`${row.purchase_no} is cancelled`)
    }
    if (row.status !== 'final') {
      throw new Error(`${row.purchase_no} is still a draft. Finalize it before applying to a sale bill.`)
    }
    res.json(loadPurchase(db, row.id))
  }),
)

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const clauses = ['1 = 1']
    const params: unknown[] = []

    const customerId = queryString(req.query, 'customerId')
    if (customerId) {
      clauses.push('p.customer_id = ?')
      params.push(Number.parseInt(customerId, 10))
    }
    const status = queryString(req.query, 'status')
    if (status && status !== 'all') {
      clauses.push('p.status = ?')
      params.push(status)
    }
    const from = queryString(req.query, 'from')
    if (from) {
      clauses.push('p.purchase_date >= ?')
      params.push(from)
    }
    const to = queryString(req.query, 'to')
    if (to) {
      clauses.push('p.purchase_date <= ?')
      params.push(to)
    }
    if (queryString(req.query, 'available') === '1') {
      clauses.push("p.status = 'final'")
      clauses.push(`p.total_amount
        - (SELECT COALESCE(SUM(amount), 0) FROM old_gold_payouts
           WHERE purchase_id = p.id AND voided_at IS NULL)
        - (SELECT COALESCE(SUM(amount_applied), 0) FROM invoice_old_gold_links
           WHERE purchase_id = p.id) > 0.009`)
    }

    const rows = db
      .prepare(
        `SELECT p.* FROM old_gold_purchases p
         WHERE ${clauses.join(' AND ')}
         ORDER BY p.purchase_date DESC, p.id DESC`,
      )
      .all(...params) as PurchaseRow[]

    const ids = rows.map((row) => row.id)
    const items = loadItemsFor(db, ids)
    const links = loadLinksFor(db, ids)
    const payouts = loadPayoutsFor(db, ids)
    res.json(
      rows.map((row) =>
        mapPurchase(row, items.get(row.id) ?? [], links.get(row.id) ?? [], payouts.get(row.id) ?? []),
      ),
    )
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    res.json(loadPurchase(getDatabase(), id))
  }),
)

router.post(
  '/',
  requireAnyFeature(['inward', 'billing']),
  asyncHandler((req, res) => {
    const input = parseBody(oldGoldPurchaseInputSchema, req.body) as OldGoldPurchaseInput
    const db = getDatabase()
    const tx = db.transaction(() => saveDraftPurchase(db, input))
    res.status(201).json(tx())
  }),
)

router.put(
  '/:id',
  requireAnyFeature(['inward', 'billing']),
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
  requireAnyFeature(['inward', 'billing']),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const tx = db.transaction(() => {
      assertDraft(db, id)
      const row = db
        .prepare('SELECT total_amount FROM old_gold_purchases WHERE id = ?')
        .get(id) as { total_amount: number }
      if (row.total_amount <= 0) {
        throw new Error('Add at least one old gold item before finalizing')
      }
      db.prepare(
        `UPDATE old_gold_purchases SET status = 'final', finalized_at = datetime('now') WHERE id = ?`,
      ).run(id)
      return loadPurchase(db, id)
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/payouts',
  requireAnyFeature(['inward', 'billing']),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(oldGoldPayoutInputSchema, req.body) as OldGoldPayoutInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = db
        .prepare('SELECT id, purchase_no, total_amount, status FROM old_gold_purchases WHERE id = ?')
        .get(id) as { id: number; purchase_no: string; total_amount: number; status: string } | undefined
      if (!row) {
        throw new Error('Old gold purchase not found')
      }
      assertFinal(row)
      const links = loadLinksFor(db, [id]).get(id) ?? []
      const payouts = loadPayoutsFor(db, [id]).get(id) ?? []
      const applied = roundMoney(links.reduce((sum, link) => sum + link.amount, 0))
      const paidOut = roundMoney(
        payouts.filter((payout) => payout.voidedAt == null).reduce((sum, payout) => sum + payout.amount, 0),
      )
      const balance = roundMoney(Math.max(0, row.total_amount - paidOut - applied))
      if (input.amount - balance > 0.009) {
        throw new Error(
          `Payout cannot exceed the balance of ${balance.toFixed(2)} on ${row.purchase_no}`,
        )
      }
      insertPayout(db, id, input, req.user?.id ?? null)
      return loadPurchase(db, id)
    })
    res.status(201).json(tx())
  }),
)

router.post(
  '/:id/payouts/:payoutId/void',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const payoutId = parseIdParam(req.params.payoutId)
    const input = parseBody(oldGoldPayoutVoidInputSchema, req.body) as { reason: string }
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = db
        .prepare('SELECT id, voided_at FROM old_gold_payouts WHERE id = ? AND purchase_id = ?')
        .get(payoutId, id) as { id: number; voided_at: string | null } | undefined
      if (!row) {
        throw new Error('Payout not found')
      }
      if (row.voided_at) {
        throw new Error('This payout is already voided')
      }
      db.prepare(
        `UPDATE old_gold_payouts SET voided_at = datetime('now'), void_reason = ? WHERE id = ?`,
      ).run(input.reason.trim(), payoutId)
      return loadPurchase(db, id)
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/cancel',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(oldGoldPurchaseCancelInputSchema, req.body) as { reason: string }
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = db
        .prepare('SELECT id, purchase_no, status FROM old_gold_purchases WHERE id = ?')
        .get(id) as { id: number; purchase_no: string; status: string } | undefined
      if (!row) {
        throw new Error('Old gold purchase not found')
      }
      if (row.status === 'cancelled') {
        throw new Error(`${row.purchase_no} is already cancelled`)
      }
      if (row.status !== 'final') {
        throw new Error('Only a finalized purchase can be cancelled. Delete a draft instead.')
      }
      const batched = db
        .prepare(
          'SELECT id FROM old_gold_purchase_items WHERE purchase_id = ? AND batch_id IS NOT NULL LIMIT 1',
        )
        .get(id)
      if (batched) {
        throw new Error('This purchase has items in a refiner batch. Remove them from the batch first.')
      }
      const link = db
        .prepare('SELECT invoice_id FROM invoice_old_gold_links WHERE purchase_id = ? LIMIT 1')
        .get(id)
      if (link) {
        throw new Error('This purchase is applied to a sale bill. Cancel that bill first.')
      }
      const payout = db
        .prepare('SELECT id FROM old_gold_payouts WHERE purchase_id = ? AND voided_at IS NULL LIMIT 1')
        .get(id)
      if (payout) {
        throw new Error('This purchase has a payout. Void the payout first.')
      }
      db.prepare(
        `UPDATE old_gold_purchases
         SET status = 'cancelled', cancelled_at = datetime('now'), cancel_reason = ?, cancelled_by = ?
         WHERE id = ?`,
      ).run(input.reason.trim(), req.user?.id ?? null, id)
      return loadPurchase(db, id)
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
