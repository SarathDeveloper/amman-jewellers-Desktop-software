import type Database from 'better-sqlite3'
import { DEFAULT_HSN } from '@shared/billing/pricing'
import type { StockAdjustmentLineInput } from '@shared/types'
import { assertUniqueHuids, stringifyHuids } from '../products/huids'
import { applyInwardStock } from './finalize'
import { nextInwardNo } from './numbering'

export const STOCK_ADDITION_SUPPLIER_NAME = 'Stock addition'
export const INWARD_SOURCE_STOCK_ADD = 'stock_add'

type ProductRow = {
  id: number
  name: string
  metal: string
  category: string
  purity: string
  gross_weight: number
  net_weight: number
}

export function ensureStockAdditionSupplier(db: Database.Database): number {
  const existing = db
    .prepare(
      `SELECT id FROM suppliers
       WHERE COALESCE(is_system, 0) = 1 AND name = ?
       LIMIT 1`,
    )
    .get(STOCK_ADDITION_SUPPLIER_NAME) as { id: number } | undefined
  if (existing) return existing.id

  const result = db
    .prepare(
      `INSERT INTO suppliers (name, phone, address, notes, gstin, is_system, created_at)
       VALUES (?, '', '', ?, '', 1, datetime('now'))`,
    )
    .run(
      STOCK_ADDITION_SUPPLIER_NAME,
      'System supplier for Adjust Stock Quantity additions',
    )
  return Number(result.lastInsertRowid)
}

function loadProduct(db: Database.Database, productId: number): ProductRow {
  const product = db
    .prepare(
      `SELECT id, name, metal, category, purity, gross_weight, net_weight
       FROM products WHERE id = ?`,
    )
    .get(productId) as ProductRow | undefined
  if (!product) {
    throw new Error(`Product ${productId} not found`)
  }
  return product
}

function lineNetWeight(line: StockAdjustmentLineInput, product: ProductRow): number {
  if (line.qtyDelta > 0 && Number.isFinite(line.weightDelta)) {
    const perPiece = line.weightDelta / line.qtyDelta
    if (Number.isFinite(perPiece) && perPiece >= 0) return perPiece
  }
  return product.net_weight
}

/** Creates and finalizes one stock_add inward for positive product adjustment lines. */
export function createAndFinalizeStockAddInward(
  db: Database.Database,
  input: {
    inwardDate: string
    notes: string
    operatorId: number | null
    lines: StockAdjustmentLineInput[]
  },
): number {
  const addLines = input.lines.filter((line) => line.productId != null && line.qtyDelta > 0)
  if (addLines.length === 0) {
    throw new Error('Stock addition inward requires at least one product add line')
  }

  const supplierId = ensureStockAdditionSupplier(db)
  const inwardNo = nextInwardNo(db, input.inwardDate)
  const result = db
    .prepare(
      `INSERT INTO inwards (
         supplier_id, inward_no, inward_date, status, subtotal, total, notes, payment_mode, source, created_at
       ) VALUES (?, ?, ?, 'draft', 0, 0, ?, 'cash', ?, datetime('now'))`,
    )
    .run(supplierId, inwardNo, input.inwardDate, input.notes, INWARD_SOURCE_STOCK_ADD)
  const inwardId = Number(result.lastInsertRowid)

  const insert = db.prepare(
    `INSERT INTO inward_items (
       inward_id, product_id, metal, category, purity, qty, gross_weight, net_weight, rate,
       making_charges, hsn_code, line_total, huids
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?)`,
  )

  const huidsOnInward = new Set<string>()
  const stockItems: Array<{
    productId: number
    productName: string
    metal: string
    category: string
    qty: number
    netWeight: number
    huids: string[]
  }> = []

  for (const line of addLines) {
    const productId = line.productId as number
    const product = loadProduct(db, productId)
    const huids = (line.huids ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean)
    for (const huid of huids) {
      if (huidsOnInward.has(huid)) {
        throw new Error(`HUID ${huid} is used on more than one line`)
      }
      huidsOnInward.add(huid)
    }
    assertUniqueHuids(db, huids)
    const netWeight = lineNetWeight(line, product)
    insert.run(
      inwardId,
      product.id,
      product.metal,
      product.category,
      product.purity,
      line.qtyDelta,
      product.gross_weight,
      netWeight,
      DEFAULT_HSN,
      stringifyHuids(huids),
    )
    stockItems.push({
      productId: product.id,
      productName: product.name,
      metal: product.metal,
      category: product.category,
      qty: line.qtyDelta,
      netWeight,
      huids,
    })
  }

  applyInwardStock(db, {
    inwardId,
    inwardDate: input.inwardDate,
    items: stockItems,
    operatorId: input.operatorId,
  })

  return inwardId
}
