import { Router } from 'express'
import {
  stocktakeCreateSchema,
  stocktakeLineUpdateSchema,
  stocktakePostSchema,
} from '@shared/schemas'
import type {
  Stocktake,
  StocktakeCreateInput,
  StocktakeLine,
  StocktakeLineUpdateInput,
} from '@shared/types'
import { getDatabase } from '../db'
import { assertMetalDayOpen } from '../db/metalDayClosing'
import { listCategoryNames } from '../db/stockCategories'
import { asyncHandler, parseBody, parseIdParam } from '../lib/http'
import { postStocktake } from '../stock/movements'
import { listRowsForMetal } from './stock.routes'

const router = Router()

type StocktakeRow = {
  id: number
  business_date: string
  metal: string
  status: 'open' | 'posted'
  operator_name: string
  note: string
  created_at: string
  posted_at: string | null
}

type StocktakeLineRow = {
  id: number
  stocktake_id: number
  item_name: string
  counted_weight: number | null
  ledger_weight: number
  variance: number
  product_id: number | null
  counted_qty: number | null
  ledger_qty: number
  qty_variance: number
}

function mapLine(row: StocktakeLineRow): StocktakeLine {
  return {
    id: row.id,
    stocktakeId: row.stocktake_id,
    itemName: row.item_name,
    countedWeight: row.counted_weight,
    ledgerWeight: row.ledger_weight,
    variance: row.variance,
    productId: row.product_id,
    countedQty: row.counted_qty,
    ledgerQty: row.ledger_qty,
    qtyVariance: row.qty_variance,
  }
}

function loadLines(db: ReturnType<typeof getDatabase>, stocktakeId: number): StocktakeLine[] {
  const rows = db
    .prepare(
      `SELECT id, stocktake_id, item_name, counted_weight, ledger_weight, variance,
              product_id, counted_qty, ledger_qty, qty_variance
       FROM stocktake_lines
       WHERE stocktake_id = ?
       ORDER BY id`,
    )
    .all(stocktakeId) as StocktakeLineRow[]
  return rows.map(mapLine)
}

function mapStocktake(db: ReturnType<typeof getDatabase>, row: StocktakeRow): Stocktake {
  return {
    id: row.id,
    businessDate: row.business_date,
    metal: row.metal,
    status: row.status,
    operatorName: row.operator_name,
    note: row.note,
    createdAt: row.created_at,
    postedAt: row.posted_at,
    lines: loadLines(db, row.id),
  }
}

function getStocktakeRow(db: ReturnType<typeof getDatabase>, id: number): StocktakeRow {
  const row = db
    .prepare('SELECT * FROM stocktakes WHERE id = ?')
    .get(id) as StocktakeRow | undefined
  if (!row) {
    throw new Error('Stocktake not found')
  }
  return row
}

router.get(
  '/',
  asyncHandler((_req, res) => {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT * FROM stocktakes
         ORDER BY business_date DESC, id DESC`,
      )
      .all() as StocktakeRow[]
    res.json(rows.map((row) => mapStocktake(db, row)))
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    res.json(mapStocktake(db, getStocktakeRow(db, id)))
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(stocktakeCreateSchema, req.body) as StocktakeCreateInput
    const db = getDatabase()
    assertMetalDayOpen(db, input.businessDate, input.metal)
    const tx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO stocktakes (business_date, metal, status, operator_name, note, created_at)
           VALUES (?, ?, 'open', ?, ?, datetime('now'))`,
        )
        .run(input.businessDate, input.metal, input.operatorName, input.note ?? '')
      const stocktakeId = Number(result.lastInsertRowid)
      const insertLine = db.prepare(
        `INSERT INTO stocktake_lines (
           stocktake_id, item_name, counted_weight, ledger_weight, variance,
           product_id, counted_qty, ledger_qty, qty_variance
         ) VALUES (?, ?, NULL, ?, 0, NULL, NULL, 0, 0)`,
      )
      for (const category of listCategoryNames(db)) {
        const liveRows = listRowsForMetal(input.businessDate, input.metal)
        const liveRow = liveRows.find((row) => row.itemName === category)
        const ledgerWeight = liveRow?.closingWeight ?? 0
        insertLine.run(stocktakeId, category, ledgerWeight)
      }
      return mapStocktake(db, getStocktakeRow(db, stocktakeId))
    })
    res.status(201).json(tx())
  }),
)

router.put(
  '/:id/lines',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(stocktakeLineUpdateSchema, req.body) as StocktakeLineUpdateInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = getStocktakeRow(db, id)
      if (row.status === 'posted') {
        throw new Error('Stocktake already posted')
      }
      for (const line of input.lines) {
        db.prepare(
          `UPDATE stocktake_lines
           SET counted_weight = ?, counted_qty = ?, product_id = ?
           WHERE id = ? AND stocktake_id = ?`,
        ).run(
          line.countedWeight ?? null,
          line.countedQty ?? null,
          line.productId ?? null,
          line.id,
          id,
        )
      }
      return mapStocktake(db, getStocktakeRow(db, id))
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/post',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = getStocktakeRow(db, id)
      if (row.status === 'posted') {
        throw new Error('Stocktake already posted')
      }
      assertMetalDayOpen(db, row.business_date, row.metal)
      postStocktake(db, { stocktakeId: id, operatorId: req.user?.id ?? null })
      return mapStocktake(db, getStocktakeRow(db, id))
    })
    res.json(tx())
  }),
)

export default router
