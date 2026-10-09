import { Router } from 'express'
import {
  oldGoldBatchCreateInputSchema,
  oldGoldBatchMeltInputSchema,
  oldGoldBatchSendInputSchema,
  oldGoldBatchSettleInputSchema,
  oldGoldBatchCancelInputSchema,
} from '@shared/schemas'
import { roundMoney, roundWeight } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import type {
  OldGoldBatch,
  OldGoldBatchItem,
  OldGoldBatchStatus,
  OldGoldLot,
  OldGoldLotGroup,
  OldGoldSettlementMode,
} from '@shared/types'
import { getDatabase } from '../db'
import { asyncHandler, parseBody, parseIdParam, queryString } from '../lib/http'
import { requireFeature } from '../auth/middleware'

const router = Router()

type Db = ReturnType<typeof getDatabase>

type ItemRow = {
  id: number
  purchase_id: number
  purchase_no: string
  purchase_date: string
  customer_name: string
  description: string
  metal: string
  gross_weight: number
  net_weight: number
  purity: string
  fine_weight: number
  final_value: number
  batch_id: number | null
}

type BatchRow = {
  id: number
  batch_no: string
  metal: string
  status: OldGoldBatchStatus
  supplier_id: number | null
  supplier_name: string | null
  created_date: string
  gross_weight: number
  fine_weight_expected: number
  cost_amount: number
  melt_date: string | null
  melted_weight: number | null
  sent_date: string | null
  sent_weight: number | null
  settled_date: string | null
  fine_weight_received: number | null
  fine_rate: number | null
  cash_received: number | null
  settlement_mode: OldGoldSettlementMode
  notes: string
  cancelled_at: string | null
  cancel_reason: string
  created_at: string
}

function yearFromDate(date: string): number {
  const year = Number.parseInt(date.slice(0, 4), 10)
  return Number.isFinite(year) && year > 0 ? year : new Date().getFullYear()
}

function nextBatchNo(db: Db, createdDate: string): string {
  const prefix = `OGB-${yearFromDate(createdDate)}-`
  const rows = db
    .prepare('SELECT batch_no FROM old_gold_batches WHERE batch_no LIKE ?')
    .all(`${prefix}%`) as Array<{ batch_no: string }>
  const max = rows.reduce((current, row) => {
    const value = Number.parseInt(row.batch_no.slice(prefix.length), 10)
    return Number.isFinite(value) ? Math.max(current, value) : current
  }, 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

function mapItem(row: ItemRow): OldGoldBatchItem {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    purchaseNo: row.purchase_no,
    purchaseDate: row.purchase_date,
    customerName: row.customer_name ?? '',
    description: row.description ?? '',
    metal: row.metal ?? 'Gold',
    grossWeight: row.gross_weight ?? 0,
    netWeight: row.net_weight ?? 0,
    purity: row.purity ?? '',
    fineWeight: row.fine_weight ?? 0,
    finalValue: row.final_value ?? 0,
    batchId: row.batch_id,
  }
}

const ITEM_SELECT = `SELECT i.id, i.purchase_id, i.description, i.metal, i.gross_weight, i.net_weight,
        i.purity, i.fine_weight, i.final_value, i.batch_id,
        p.purchase_no, p.purchase_date, p.customer_name
 FROM old_gold_purchase_items i
 JOIN old_gold_purchases p ON p.id = i.purchase_id`

function loadItems(db: Db, batchId: number): OldGoldBatchItem[] {
  const rows = db
    .prepare(`${ITEM_SELECT} WHERE i.batch_id = ? ORDER BY i.id`)
    .all(batchId) as ItemRow[]
  return rows.map(mapItem)
}

function mapBatch(row: BatchRow, items: OldGoldBatchItem[]): OldGoldBatch {
  const cost = roundMoney(row.cost_amount)
  const received = roundMoney(row.cash_received ?? 0)
  const fineReceived = roundWeight(row.fine_weight_received ?? 0)
  const fineRate = roundMoney(row.fine_rate ?? 0)
  return {
    id: row.id,
    batchNo: row.batch_no,
    metal: row.metal,
    status: row.status,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name ?? '',
    createdDate: row.created_date,
    grossWeight: roundWeight(row.gross_weight),
    fineWeightExpected: roundWeight(row.fine_weight_expected),
    costAmount: cost,
    meltDate: row.melt_date,
    meltedWeight: row.melted_weight == null ? null : roundWeight(row.melted_weight),
    sentDate: row.sent_date,
    sentWeight: row.sent_weight == null ? null : roundWeight(row.sent_weight),
    settledDate: row.settled_date,
    fineWeightReceived: row.fine_weight_received == null ? null : fineReceived,
    fineRate: row.fine_rate == null ? null : fineRate,
    cashReceived: row.cash_received == null ? null : roundMoney(row.cash_received),
    settlementMode: row.settlement_mode,
    notes: row.notes ?? '',
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason ?? '',
    createdAt: row.created_at,
    items,
    gainLoss: roundMoney(received + fineReceived * fineRate - cost),
  }
}

const BATCH_SELECT = `SELECT b.*, s.name AS supplier_name
 FROM old_gold_batches b
 LEFT JOIN suppliers s ON s.id = b.supplier_id`

function loadBatch(db: Db, id: number): OldGoldBatch {
  const row = db.prepare(`${BATCH_SELECT} WHERE b.id = ?`).get(id) as BatchRow | undefined
  if (!row) {
    throw new Error('Refiner batch not found')
  }
  return mapBatch(row, loadItems(db, id))
}

function assertStatus(row: BatchRow, allowed: OldGoldBatchStatus[], action: string): void {
  if (!allowed.includes(row.status)) {
    throw new Error(`${row.batch_no} is ${row.status}. Cannot ${action} it.`)
  }
}

router.get(
  '/next-batch-no',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const date = queryString(req.query, 'date') || localTodayIso()
    res.json({ batchNo: nextBatchNo(db, date) })
  }),
)

router.get(
  '/lot',
  asyncHandler((_req, res) => {
    const db = getDatabase()
    const rows = db
      .prepare(
        `${ITEM_SELECT}
         WHERE p.status = 'final' AND i.batch_id IS NULL
         ORDER BY i.metal, p.purchase_date, i.id`,
      )
      .all() as ItemRow[]
    const items = rows.map(mapItem)
    const groupsByMetal = new Map<string, OldGoldLotGroup>()
    for (const item of items) {
      const group = groupsByMetal.get(item.metal) ?? {
        metal: item.metal,
        items: 0,
        grossWeight: 0,
        netWeight: 0,
        fineWeight: 0,
        costAmount: 0,
      }
      group.items += 1
      group.grossWeight += item.grossWeight
      group.netWeight += item.netWeight
      group.fineWeight += item.fineWeight
      group.costAmount += item.finalValue
      groupsByMetal.set(item.metal, group)
    }
    const groups: OldGoldLotGroup[] = [...groupsByMetal.values()]
      .map((group) => ({
        ...group,
        grossWeight: roundWeight(group.grossWeight),
        netWeight: roundWeight(group.netWeight),
        fineWeight: roundWeight(group.fineWeight),
        costAmount: roundMoney(group.costAmount),
      }))
      .sort((a, b) => a.metal.localeCompare(b.metal))
    const lot: OldGoldLot = { groups, items }
    res.json(lot)
  }),
)

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const clauses = ['1 = 1']
    const params: unknown[] = []
    const status = queryString(req.query, 'status')
    if (status && status !== 'all') {
      clauses.push('b.status = ?')
      params.push(status)
    }
    const from = queryString(req.query, 'from')
    if (from) {
      clauses.push('b.created_date >= ?')
      params.push(from)
    }
    const to = queryString(req.query, 'to')
    if (to) {
      clauses.push('b.created_date <= ?')
      params.push(to)
    }
    const rows = db
      .prepare(
        `${BATCH_SELECT}
         WHERE ${clauses.join(' AND ')}
         ORDER BY b.created_date DESC, b.id DESC`,
      )
      .all(...params) as BatchRow[]
    res.json(rows.map((row) => mapBatch(row, loadItems(db, row.id))))
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    res.json(loadBatch(getDatabase(), id))
  }),
)

router.post(
  '/',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const input = parseBody(oldGoldBatchCreateInputSchema, req.body)
    const db = getDatabase()
    const tx = db.transaction(() => {
      const placeholders = input.itemIds.map(() => '?').join(', ')
      const rows = db
        .prepare(`${ITEM_SELECT} WHERE i.id IN (${placeholders})`)
        .all(...input.itemIds) as ItemRow[]
      if (rows.length !== input.itemIds.length) {
        throw new Error('One or more old gold items could not be found')
      }
      const metals = new Set(rows.map((row) => row.metal ?? 'Gold'))
      if (metals.size > 1) {
        throw new Error('A batch can only hold items of a single metal')
      }
      for (const row of rows) {
        if (row.batch_id != null) {
          throw new Error(`Item ${row.id} is already in a batch`)
        }
        const purchaseStatus = db
          .prepare('SELECT status FROM old_gold_purchases WHERE id = ?')
          .get(row.purchase_id) as { status: string } | undefined
        if (purchaseStatus?.status !== 'final') {
          throw new Error('Only items of finalized purchases can be batched')
        }
      }
      const metal = [...metals][0]
      const grossWeight = roundWeight(rows.reduce((sum, row) => sum + (row.gross_weight ?? 0), 0))
      const fineWeight = roundWeight(rows.reduce((sum, row) => sum + (row.fine_weight ?? 0), 0))
      const costAmount = roundMoney(rows.reduce((sum, row) => sum + (row.final_value ?? 0), 0))
      const batchNo = nextBatchNo(db, input.createdDate)
      const result = db
        .prepare(
          `INSERT INTO old_gold_batches (
             batch_no, metal, status, supplier_id, created_date,
             gross_weight, fine_weight_expected, cost_amount, notes, created_at
           ) VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          batchNo,
          metal,
          input.supplierId ?? null,
          input.createdDate,
          grossWeight,
          fineWeight,
          costAmount,
          input.notes ?? '',
        )
      const batchId = Number(result.lastInsertRowid)
      const assign = db.prepare('UPDATE old_gold_purchase_items SET batch_id = ? WHERE id = ?')
      for (const row of rows) {
        assign.run(batchId, row.id)
      }
      return loadBatch(db, batchId)
    })
    res.status(201).json(tx())
  }),
)

router.post(
  '/:id/melt',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(oldGoldBatchMeltInputSchema, req.body)
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = db.prepare('SELECT * FROM old_gold_batches WHERE id = ?').get(id) as
        | BatchRow
        | undefined
      if (!row) throw new Error('Refiner batch not found')
      assertStatus(row, ['open'], 'melt')
      const notes = input.notes?.trim()
      db.prepare(
        `UPDATE old_gold_batches SET status = 'melted', melt_date = ?, melted_weight = ?,
           notes = CASE WHEN ? = '' THEN notes ELSE ? END
         WHERE id = ?`,
      ).run(input.meltDate, input.meltedWeight, notes ?? '', notes ?? '', id)
      return loadBatch(db, id)
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/send',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(oldGoldBatchSendInputSchema, req.body)
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = db.prepare('SELECT * FROM old_gold_batches WHERE id = ?').get(id) as
        | BatchRow
        | undefined
      if (!row) throw new Error('Refiner batch not found')
      assertStatus(row, ['melted'], 'send')
      const notes = input.notes?.trim()
      db.prepare(
        `UPDATE old_gold_batches SET status = 'sent', sent_date = ?, sent_weight = ?,
           notes = CASE WHEN ? = '' THEN notes ELSE ? END
         WHERE id = ?`,
      ).run(input.sentDate, input.sentWeight, notes ?? '', notes ?? '', id)
      return loadBatch(db, id)
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/settle',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(oldGoldBatchSettleInputSchema, req.body)
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = db.prepare('SELECT * FROM old_gold_batches WHERE id = ?').get(id) as
        | BatchRow
        | undefined
      if (!row) throw new Error('Refiner batch not found')
      assertStatus(row, ['sent'], 'settle')
      const notes = input.notes?.trim()
      db.prepare(
        `UPDATE old_gold_batches SET status = 'settled', settled_date = ?, fine_weight_received = ?,
           fine_rate = ?, cash_received = ?, settlement_mode = ?,
           notes = CASE WHEN ? = '' THEN notes ELSE ? END
         WHERE id = ?`,
      ).run(
        input.settledDate,
        input.fineWeightReceived,
        input.fineRate,
        input.cashReceived,
        input.settlementMode ?? 'cash',
        notes ?? '',
        notes ?? '',
        id,
      )
      return loadBatch(db, id)
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/cancel',
  requireFeature('inward'),
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(oldGoldBatchCancelInputSchema, req.body)
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = db.prepare('SELECT * FROM old_gold_batches WHERE id = ?').get(id) as
        | BatchRow
        | undefined
      if (!row) throw new Error('Refiner batch not found')
      if (row.status === 'cancelled') throw new Error(`${row.batch_no} is already cancelled`)
      assertStatus(row, ['open', 'melted', 'sent'], 'cancel')
      db.prepare('UPDATE old_gold_purchase_items SET batch_id = NULL WHERE batch_id = ?').run(id)
      db.prepare(
        `UPDATE old_gold_batches SET status = 'cancelled', cancelled_at = datetime('now'),
           cancel_reason = ?
         WHERE id = ?`,
      ).run(input.reason.trim(), id)
      return loadBatch(db, id)
    })
    res.json(tx())
  }),
)

export default router
