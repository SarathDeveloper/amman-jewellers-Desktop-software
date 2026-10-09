import { Router } from 'express'
import { huidRemovalRange } from '@shared/itemTypes'
import { stockAdjustmentInputSchema } from '@shared/schemas'
import type { StockAdjustment, StockAdjustmentInput, StockAdjustmentLine } from '@shared/types'
import { getDatabase } from '../db'
import { assertMetalDayOpen } from '../db/metalDayClosing'
import { asyncHandler, parseBody, parseIdParam } from '../lib/http'
import { appendHuids, listHuids, removeHuids, requireHuidsForNewPieces } from '../products/huids'
import { recordAdjustment } from '../stock/movements'

const router = Router()

type AdjustmentRow = {
  id: number
  adjustment_date: string
  reason: string
  note: string
  operator_id: number | null
  created_at: string
}

type AdjustmentLineRow = {
  id: number
  adjustment_id: number
  product_id: number | null
  metal: string
  category: string
  qty_delta: number
  weight_delta: number
  reason: string
}

function applyAdjustmentHuids(
  db: ReturnType<typeof getDatabase>,
  lines: StockAdjustmentInput['lines'],
): void {
  for (const line of lines) {
    if (line.productId == null) continue
    const product = db
      .prepare('SELECT metal, stock_qty FROM products WHERE id = ?')
      .get(line.productId) as { metal: string; stock_qty: number } | undefined
    if (!product) {
      throw new Error(`Product ${line.productId} not found`)
    }
    const huids = line.huids ?? []
    if (line.qtyDelta > 0) {
      requireHuidsForNewPieces(product.metal, huids, line.qtyDelta)
      appendHuids(db, line.productId, huids)
    } else if (line.qtyDelta < 0) {
      const existing = listHuids(db, line.productId)
      if (existing.length === 0) continue
      const { min, max } = huidRemovalRange(
        product.metal,
        existing.length,
        product.stock_qty,
        Math.abs(line.qtyDelta),
      )
      if (min === max && huids.length !== max) {
        throw new Error(max === 1 ? 'Select 1 HUID to remove' : `Select ${max} HUIDs to remove`)
      }
      if (huids.length < min) {
        throw new Error(min === 1 ? 'Select at least 1 HUID to remove' : `Select at least ${min} HUIDs to remove`)
      }
      if (huids.length > max) {
        throw new Error(max === 1 ? 'Select at most 1 HUID to remove' : `Select at most ${max} HUIDs to remove`)
      }
      removeHuids(db, line.productId, huids)
    }
  }
}

function mapLine(row: AdjustmentLineRow): StockAdjustmentLine {
  return {
    id: row.id,
    adjustmentId: row.adjustment_id,
    productId: row.product_id,
    metal: row.metal,
    category: row.category,
    qtyDelta: row.qty_delta,
    weightDelta: row.weight_delta,
    reason: row.reason,
  }
}

function loadLines(db: ReturnType<typeof getDatabase>, adjustmentId: number): StockAdjustmentLine[] {
  const rows = db
    .prepare(
      `SELECT id, adjustment_id, product_id, metal, category, qty_delta, weight_delta, reason
       FROM stock_adjustment_lines
       WHERE adjustment_id = ?
       ORDER BY id`,
    )
    .all(adjustmentId) as AdjustmentLineRow[]
  return rows.map(mapLine)
}

function mapAdjustment(db: ReturnType<typeof getDatabase>, row: AdjustmentRow): StockAdjustment {
  return {
    id: row.id,
    adjustmentDate: row.adjustment_date,
    reason: row.reason,
    note: row.note,
    operatorId: row.operator_id,
    createdAt: row.created_at,
    lines: loadLines(db, row.id),
  }
}

function getAdjustmentRow(db: ReturnType<typeof getDatabase>, id: number): AdjustmentRow {
  const row = db
    .prepare('SELECT * FROM stock_adjustments WHERE id = ?')
    .get(id) as AdjustmentRow | undefined
  if (!row) {
    throw new Error('Adjustment not found')
  }
  return row
}

router.get(
  '/',
  asyncHandler((_req, res) => {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT * FROM stock_adjustments
         ORDER BY adjustment_date DESC, id DESC`,
      )
      .all() as AdjustmentRow[]
    res.json(rows.map((row) => mapAdjustment(db, row)))
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    res.json(mapAdjustment(db, getAdjustmentRow(db, id)))
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(stockAdjustmentInputSchema, req.body) as StockAdjustmentInput
    const db = getDatabase()
    const metals = Array.from(new Set(input.lines.map((line) => line.metal.trim())))
    for (const metal of metals) {
      assertMetalDayOpen(db, input.adjustmentDate, metal)
    }
    const tx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO stock_adjustments (adjustment_date, reason, note, operator_id, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          input.adjustmentDate,
          input.reason,
          input.note ?? '',
          req.user?.id ?? null,
        )
      const adjustmentId = Number(result.lastInsertRowid)
      const insertLine = db.prepare(
        `INSERT INTO stock_adjustment_lines (
           adjustment_id, product_id, metal, category, qty_delta, weight_delta, reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const line of input.lines) {
        insertLine.run(
          adjustmentId,
          line.productId ?? null,
          line.metal.trim(),
          line.category.trim(),
          line.qtyDelta,
          line.weightDelta,
          line.reason ?? '',
        )
      }
      applyAdjustmentHuids(db, input.lines)
      recordAdjustment(db, {
        adjustmentId,
        adjustmentDate: input.adjustmentDate,
        lines: input.lines.map((line) => ({
          productId: line.productId ?? null,
          metal: line.metal.trim(),
          category: line.category.trim(),
          qtyDelta: line.qtyDelta,
          weightDelta: line.weightDelta,
          reason: line.reason,
        })),
        operatorId: req.user?.id ?? null,
      })
      return mapAdjustment(db, getAdjustmentRow(db, adjustmentId))
    })
    res.status(201).json(tx())
  }),
)

export default router
