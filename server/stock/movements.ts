import type Database from 'better-sqlite3'
import type { StockMovementType } from '@shared/types'
import { localTodayIso } from '@shared/localDate'
import { requireCategory } from '../db/stockCategories'

export interface PieceMovementInput {
  type: StockMovementType
  productId: number
  qtyDelta: number
  weightDelta?: number
  refType?: string | null
  refId?: number | null
  reason?: string
  note?: string
  operatorId?: number | null
  movementDate?: string
}

export interface WeightMovementInput {
  type: 'exchange_in' | 'purchase' | 'adjustment' | 'stocktake_adjustment'
  metal: string
  category: string
  weightDelta: number
  refType?: string | null
  refId?: number | null
  reason?: string
  note?: string
  operatorId?: number | null
  movementDate?: string
}

export interface AdjustmentLineInput {
  productId?: number | null
  metal: string
  category: string
  qtyDelta: number
  weightDelta: number
  reason?: string
}

export interface AdjustmentInput {
  adjustmentId: number
  adjustmentDate: string
  lines: AdjustmentLineInput[]
  operatorId?: number | null
}

export interface StocktakePostInput {
  stocktakeId: number
  operatorId?: number | null
}

type ProductStockRow = {
  id: number
  name: string
  stock_qty: number
  net_weight: number
  metal: string
  category: string
}

function loadProduct(db: Database.Database, productId: number): ProductStockRow {
  const product = db
    .prepare(
      `SELECT id, name, stock_qty, net_weight, metal, category FROM products WHERE id = ?`,
    )
    .get(productId) as ProductStockRow | undefined
  if (!product) {
    throw new Error(`Product ${productId} not found`)
  }
  return product
}

function insertPieceMovement(
  db: Database.Database,
  product: ProductStockRow,
  input: PieceMovementInput,
  qtyDelta: number,
): void {
  const weightDelta =
    input.weightDelta !== undefined ? input.weightDelta : qtyDelta * product.net_weight
  db.prepare(
    `INSERT INTO stock_movements (
       movement_date, movement_type, product_id, qty_delta, weight_delta,
       metal, category, reference_type, reference_id, operator_id, reason, note, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    input.movementDate ?? localTodayIso(),
    input.type,
    product.id,
    qtyDelta,
    weightDelta,
    product.metal,
    product.category,
    input.refType ?? null,
    input.refId ?? null,
    input.operatorId ?? null,
    input.reason ?? '',
    input.note ?? '',
  )
}

function insertWeightMovement(
  db: Database.Database,
  input: WeightMovementInput,
): void {
  db.prepare(
    `INSERT INTO stock_movements (
       movement_date, movement_type, product_id, qty_delta, weight_delta,
       metal, category, reference_type, reference_id, operator_id, reason, note, created_at
     ) VALUES (?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    input.movementDate ?? localTodayIso(),
    input.type,
    input.weightDelta,
    input.metal,
    input.category,
    input.refType ?? null,
    input.refId ?? null,
    input.operatorId ?? null,
    input.reason ?? '',
    input.note ?? '',
  )
}

/** Writes an opening movement for the product's current qty without changing stock. */
export function recordOpeningSnapshot(
  db: Database.Database,
  productId: number,
  options: { operatorId?: number | null; reason?: string } = {},
): void {
  const product = loadProduct(db, productId)
  if (product.stock_qty <= 0) return
  insertPieceMovement(
    db,
    product,
    {
      type: 'opening',
      productId,
      qtyDelta: product.stock_qty,
      refType: 'product',
      refId: productId,
      reason: options.reason ?? 'Opening stock',
      operatorId: options.operatorId,
    },
    product.stock_qty,
  )
}

/** Updates piece stock and writes a movement row. The only path invoice/inward finalize should use. */
export function recordPieceMovement(db: Database.Database, input: PieceMovementInput): void {
  const product = loadProduct(db, input.productId)
  const nextQty = product.stock_qty + input.qtyDelta
  if (nextQty < 0) {
    throw new Error(`Insufficient stock for ${product.name}`)
  }
  db.prepare(
    `UPDATE products SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(nextQty, product.id)
  insertPieceMovement(db, product, input, input.qtyDelta)
}

/** Writes a weight-only movement (no product, no piece count). Used for exchange, raw-metal inward, adjustments. */
export function recordWeightMovement(db: Database.Database, input: WeightMovementInput): void {
  if (!input.metal.trim()) {
    throw new Error('Weight movement requires a metal')
  }
  if (!input.category.trim()) {
    throw new Error('Weight movement requires a category')
  }
  requireCategory(db, input.category)
  insertWeightMovement(db, input)
}

/** Posts an adjustment document: writes one movement per line, updates piece stock for product-linked lines. */
export function recordAdjustment(db: Database.Database, input: AdjustmentInput): void {
  for (const line of input.lines) {
    if (line.productId != null) {
      const type: StockMovementType =
        line.reason === 'damaged'
          ? 'damaged'
          : line.reason === 'lost'
            ? 'lost'
            : 'adjustment'
      recordPieceMovement(db, {
        type,
        productId: line.productId,
        qtyDelta: line.qtyDelta,
        refType: 'adjustment',
        refId: input.adjustmentId,
        reason: line.reason || 'Stock adjustment',
        operatorId: input.operatorId ?? null,
        movementDate: input.adjustmentDate,
      })
    } else {
      recordWeightMovement(db, {
        type: 'adjustment',
        metal: line.metal,
        category: line.category,
        weightDelta: line.weightDelta,
        refType: 'adjustment',
        refId: input.adjustmentId,
        reason: line.reason || 'Stock adjustment',
        operatorId: input.operatorId ?? null,
        movementDate: input.adjustmentDate,
      })
    }
  }
}

type StocktakeLineRow = {
  id: number
  item_name: string
  counted_weight: number | null
  ledger_weight: number
  product_id: number | null
  counted_qty: number | null
  ledger_qty: number
}

/** Posts a stocktake: writes a movement for each non-zero variance, then marks the stocktake posted. */
export function postStocktake(db: Database.Database, input: StocktakePostInput): void {
  const stocktake = db
    .prepare(
      `SELECT id, business_date, metal, status FROM stocktakes WHERE id = ?`,
    )
    .get(input.stocktakeId) as
    | { id: number; business_date: string; metal: string; status: string }
    | undefined
  if (!stocktake) {
    throw new Error('Stocktake not found')
  }
  if (stocktake.status === 'posted') {
    throw new Error('Stocktake already posted')
  }

  const lines = db
    .prepare(
      `SELECT id, item_name, counted_weight, ledger_weight, product_id, counted_qty, ledger_qty
       FROM stocktake_lines
       WHERE stocktake_id = ?
       ORDER BY id`,
    )
    .all(input.stocktakeId) as StocktakeLineRow[]

  for (const line of lines) {
    const countedWeight = line.counted_weight ?? 0
    const weightVariance = countedWeight - line.ledger_weight
    if (Math.abs(weightVariance) > 0.0001) {
      recordWeightMovement(db, {
        type: 'stocktake_adjustment',
        metal: stocktake.metal,
        category: line.item_name,
        weightDelta: weightVariance,
        refType: 'stocktake',
        refId: stocktake.id,
        reason: 'Stocktake weight variance',
        operatorId: input.operatorId ?? null,
        movementDate: stocktake.business_date,
      })
    }
    if (line.product_id != null) {
      const countedQty = line.counted_qty ?? 0
      const qtyVariance = countedQty - line.ledger_qty
      if (qtyVariance !== 0) {
        recordPieceMovement(db, {
          type: 'stocktake_adjustment',
          productId: line.product_id,
          qtyDelta: qtyVariance,
          refType: 'stocktake',
          refId: stocktake.id,
          reason: 'Stocktake piece variance',
          operatorId: input.operatorId ?? null,
          movementDate: stocktake.business_date,
        })
      }
    }
    db.prepare(
      `UPDATE stocktake_lines
       SET variance = ?, qty_variance = ?
       WHERE id = ?`,
    ).run(weightVariance, line.product_id != null ? (line.counted_qty ?? 0) - line.ledger_qty : 0, line.id)
  }

  db.prepare(
    `UPDATE stocktakes
     SET status = 'posted', posted_at = datetime('now')
     WHERE id = ?`,
  ).run(input.stocktakeId)
}
