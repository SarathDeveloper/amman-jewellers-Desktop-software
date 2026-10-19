import { Router } from 'express'
import { idSchema, inventoryPiecesUpdateSchema, productInputSchema } from '@shared/schemas'
import type {
  InventoryPieceUpdateInput,
  Product,
  ProductAttributes,
  ProductInput,
} from '@shared/types'
import { EMPTY_PRODUCT_VARIANT_FIELDS } from '@shared/types'
import { roundWeight } from '@shared/billing/pricing'
import { getDatabase } from '../db'
import { assertCategoryExists, listCategoryRows, mapCategory } from '../db/stockCategories'
import { asyncHandler, parseBody, parseIdParam } from '../lib/http'
import { assertUniqueHuids, loadHuidsFor, replaceHuids } from '../products/huids'
import { recordOpeningSnapshot, recordPieceMovement } from '../stock/movements'
import {
  convertProductToTracked,
  createOpeningPieces,
  findPieceByTagOrHuid,
  listInStockPieces,
  listPiecesForProduct,
  updateInStockPieces,
} from '../stock/pieces'

const router = Router()

type ProductRow = {
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
  parent_id: number | null
  variant_code: string | null
  size: string | null
  stone_weight: number | null
  stone_details: string | null
  attributes: string | null
  is_active: number | null
  track_pieces: number | null
}

function parseAttributes(raw: string | null | undefined): ProductAttributes {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      ([key, value]) => key.trim() && typeof value === 'string',
    )
    return Object.fromEntries(entries.map(([key, value]) => [key.trim(), value as string]))
  } catch {
    return {}
  }
}

function stringifyAttributes(attributes: ProductAttributes | undefined): string {
  const cleaned = Object.fromEntries(
    Object.entries(attributes ?? {})
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key && value),
  )
  return JSON.stringify(cleaned)
}

function mapProduct(row: ProductRow, huids: string[] = []): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    metal: row.metal,
    purity: row.purity,
    grossWeight: row.gross_weight,
    netWeight: row.net_weight,
    makingCharges: row.making_charges,
    stockQty: row.stock_qty,
    imagePath: row.image_path,
    updatedAt: row.updated_at,
    parentId: row.parent_id ?? EMPTY_PRODUCT_VARIANT_FIELDS.parentId,
    variantCode: row.variant_code ?? '',
    size: row.size ?? '',
    stoneWeight: row.stone_weight ?? 0,
    stoneDetails: row.stone_details ?? '',
    attributes: parseAttributes(row.attributes),
    isActive: (row.is_active ?? 1) === 1,
    huids,
    trackPieces: (row.track_pieces ?? 0) === 1,
  }
}

function mapProductRows(db: ReturnType<typeof getDatabase>, rows: ProductRow[]): Product[] {
  const huidsByProduct = loadHuidsFor(
    db,
    rows.map((row) => row.id),
  )
  return rows.map((row) => mapProduct(row, huidsByProduct.get(row.id) ?? []))
}

function getProductRow(
  db: ReturnType<typeof getDatabase>,
  id: number,
): ProductRow | undefined {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined
}

function requireProductRow(db: ReturnType<typeof getDatabase>, id: number): ProductRow {
  const row = getProductRow(db, id)
  if (!row) {
    throw new Error('Product not found')
  }
  return row
}

function variantCodeValue(code: string | undefined): string | null {
  const trimmed = (code ?? '').trim()
  return trimmed ? trimmed : null
}

function assertUniqueVariantCode(
  db: ReturnType<typeof getDatabase>,
  code: string | null,
  excludeId?: number,
): void {
  if (!code) return
  const existing = db
    .prepare(
      `SELECT id FROM products
       WHERE lower(variant_code) = lower(?)
         AND (? IS NULL OR id != ?)`,
    )
    .get(code, excludeId ?? null, excludeId ?? null) as { id: number } | undefined
  if (existing) {
    throw new Error('A product with this variant code already exists')
  }
}

function countChildren(db: ReturnType<typeof getDatabase>, parentId: number): number {
  return (
    db.prepare('SELECT COUNT(*) AS count FROM products WHERE parent_id = ?').get(parentId) as {
      count: number
    }
  ).count
}

function resolveParent(
  db: ReturnType<typeof getDatabase>,
  parentId: number | null | undefined,
  currentId?: number,
): ProductRow | null {
  if (parentId == null) return null
  if (currentId != null && parentId === currentId) {
    throw new Error('A product cannot be a variant of itself')
  }
  const parent = getProductRow(db, parentId)
  if (!parent) {
    throw new Error('Parent product not found')
  }
  if (parent.parent_id != null) {
    throw new Error('Variants cannot have their own variants')
  }
  return parent
}

function applyParentDefaults(input: ProductInput, parent: ProductRow | null): ProductInput {
  if (!parent) return input
  return {
    ...input,
    name: input.name.trim() || parent.name,
    category: input.category.trim() || parent.category,
    metal: input.metal.trim() || parent.metal,
    purity: input.purity.trim() || parent.purity,
    imagePath: input.imagePath.trim() || parent.image_path,
  }
}

function listProductRows(
  db: ReturnType<typeof getDatabase>,
  options: { term?: string; parentId?: number },
): ProductRow[] {
  const term = options.term?.trim() ?? ''
  if (options.parentId != null) {
    if (term) {
      return db
        .prepare(
          `SELECT * FROM products
           WHERE parent_id = ?
             AND (
               name LIKE ? OR category LIKE ? OR IFNULL(variant_code, '') LIKE ?
               OR IFNULL(size, '') LIKE ? OR IFNULL(stone_details, '') LIKE ?
               OR EXISTS (
                 SELECT 1 FROM product_huids ph
                 WHERE ph.product_id = products.id AND ph.huid LIKE ?
               )
             )
           ORDER BY updated_at DESC`,
        )
        .all(
          options.parentId,
          `%${term}%`,
          `%${term}%`,
          `%${term}%`,
          `%${term}%`,
          `%${term}%`,
          `%${term}%`,
        ) as ProductRow[]
    }
    return db
      .prepare('SELECT * FROM products WHERE parent_id = ? ORDER BY updated_at DESC')
      .all(options.parentId) as ProductRow[]
  }

  const rows = term
    ? (db
        .prepare(
          `SELECT * FROM products
           WHERE name LIKE ? OR category LIKE ? OR IFNULL(variant_code, '') LIKE ?
             OR IFNULL(size, '') LIKE ? OR IFNULL(stone_details, '') LIKE ?
             OR EXISTS (
               SELECT 1 FROM product_huids ph
               WHERE ph.product_id = products.id AND ph.huid LIKE ?
             )
           ORDER BY updated_at DESC`,
        )
        .all(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`) as ProductRow[])
    : (db.prepare('SELECT * FROM products ORDER BY updated_at DESC').all() as ProductRow[])

  if (!term) return rows

  const byId = new Map(rows.map((row) => [row.id, row]))
  const missingParentIds = [
    ...new Set(
      rows
        .map((row) => row.parent_id)
        .filter((id): id is number => id != null && !byId.has(id)),
    ),
  ]
  if (missingParentIds.length === 0) return rows

  const placeholders = missingParentIds.map(() => '?').join(', ')
  const parents = db
    .prepare(`SELECT * FROM products WHERE id IN (${placeholders})`)
    .all(...missingParentIds) as ProductRow[]
  return [...parents, ...rows]
}

router.get(
  '/categories',
  asyncHandler((_req, res) => {
    res.json(listCategoryRows(getDatabase()).map(mapCategory))
  }),
)

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const term = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const parentIdRaw = typeof req.query.parentId === 'string' ? req.query.parentId.trim() : ''
    const parentId = parentIdRaw ? parseIdParam(parentIdRaw) : undefined
    res.json(mapProductRows(db, listProductRows(db, { term, parentId })))
  }),
)

router.get(
  '/pieces/lookup',
  asyncHandler((req, res) => {
    const term = typeof req.query.term === 'string' ? req.query.term.trim() : ''
    const piece = findPieceByTagOrHuid(getDatabase(), term)
    if (!piece) {
      res.status(404).json({ error: `No piece matches ${term}` })
      return
    }
    res.json(piece)
  }),
)

router.get(
  '/:id/variants',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    requireProductRow(db, id)
    res.json(mapProductRows(db, listProductRows(db, { parentId: id })))
  }),
)

router.get(
  '/:id/pieces',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    requireProductRow(db, id)
    const onlyInStock = req.query.status === 'in_stock'
    res.json(onlyInStock ? listInStockPieces(db, id) : listPiecesForProduct(db, id))
  }),
)

router.put(
  '/:id/pieces',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(inventoryPiecesUpdateSchema, req.body) as {
      pieces: InventoryPieceUpdateInput[]
    }
    const db = getDatabase()
    const pieces = db.transaction(() => {
      requireProductRow(db, id)
      return updateInStockPieces(db, id, input.pieces)
    })()
    res.json(pieces)
  }),
)

router.post(
  '/:id/track-pieces',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const tx = db.transaction(() => {
      requireProductRow(db, id)
      convertProductToTracked(db, id)
      return requireProductRow(db, id)
    })
    res.json(mapProductRows(getDatabase(), [tx()])[0])
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    idSchema.parse(id)
    const db = getDatabase()
    const row = requireProductRow(db, id)
    res.json(mapProductRows(db, [row])[0])
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const parsed = parseBody(productInputSchema, req.body) as ProductInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const parent = resolveParent(db, parsed.parentId)
      const input = applyParentDefaults(parsed, parent)
      assertCategoryExists(db, input.category)
      const variantCode = variantCodeValue(input.variantCode)
      assertUniqueVariantCode(db, variantCode)
      const openingPieces = input.pieces ?? []
      const huids =
        openingPieces.length > 0
          ? openingPieces
              .map((piece) => (piece.huid ?? '').trim().toUpperCase())
              .filter((huid) => huid.length > 0)
          : (input.huids ?? [])
      assertUniqueHuids(db, huids)
      const result = db
        .prepare(
          `INSERT INTO products (
            name, category, metal, purity, gross_weight, net_weight, making_charges, stock_qty, image_path,
            parent_id, variant_code, size, stone_weight, stone_details, attributes, is_active, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          input.name,
          input.category,
          input.metal,
          input.purity,
          input.grossWeight,
          input.netWeight,
          input.makingCharges,
          input.stockQty,
          input.imagePath,
          parent?.id ?? null,
          variantCode,
          input.size ?? '',
          input.stoneWeight ?? 0,
          input.stoneDetails ?? '',
          stringifyAttributes(input.attributes),
          input.isActive === false ? 0 : 1,
        )
      const id = Number(result.lastInsertRowid)
      if (input.stockQty > 0) {
        const pieceNet = openingPieces.reduce((sum, piece) => sum + piece.netWeight, 0)
        recordOpeningSnapshot(db, id, {
          operatorId: req.user?.id ?? null,
          reason: 'Product create',
          weightDelta: openingPieces.length > 0 ? roundWeight(pieceNet) : undefined,
        })
      }
      // New products default to piece tracking. Rows typed on the form keep their
      // own weights; otherwise each piece copies the design weight.
      if (openingPieces.length > 0) {
        createOpeningPieces(db, id, openingPieces)
      } else if (input.trackPieces === true) {
        if (input.stockQty > 0) {
          replaceHuids(db, id, huids)
          convertProductToTracked(db, id)
        } else {
          db.prepare(
            `UPDATE products SET track_pieces = 1, updated_at = datetime('now') WHERE id = ?`,
          ).run(id)
        }
      } else {
        replaceHuids(db, id, huids)
      }
      return requireProductRow(db, id)
    })
    const row = tx()
    res.status(201).json(mapProductRows(getDatabase(), [row])[0])
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const parsed = parseBody(productInputSchema, req.body) as ProductInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const existing = getProductRow(db, id)
      if (!existing) {
        throw new Error('Product not found')
      }
      const nextParentId = parsed.parentId === undefined ? existing.parent_id : parsed.parentId
      if (nextParentId != null && countChildren(db, id) > 0) {
        throw new Error('A design with variants cannot itself become a variant')
      }
      const parent = resolveParent(db, nextParentId, id)
      const input = applyParentDefaults(parsed, parent)
      assertCategoryExists(db, input.category)
      const variantCode = variantCodeValue(input.variantCode)
      assertUniqueVariantCode(db, variantCode, id)
      const openingPieces = input.pieces ?? []
      const huids =
        openingPieces.length > 0
          ? openingPieces
              .map((piece) => (piece.huid ?? '').trim().toUpperCase())
              .filter((huid) => huid.length > 0)
          : (input.huids ?? [])
      assertUniqueHuids(db, huids, id)
      const tracksPieces = (existing.track_pieces ?? 0) === 1
      if (tracksPieces && input.trackPieces === false) {
        throw new Error('Piece tracking cannot be turned off once a product tracks each piece')
      }
      if (tracksPieces && input.stockQty !== existing.stock_qty) {
        throw new Error(
          'This product tracks each piece. Change its stock in Adjust stock, one piece at a time.',
        )
      }
      db.prepare(
        `UPDATE products SET
          name = ?, category = ?, metal = ?, purity = ?,
          gross_weight = ?, net_weight = ?, making_charges = ?, image_path = ?,
          parent_id = ?, variant_code = ?, size = ?, stone_weight = ?, stone_details = ?,
          attributes = ?, is_active = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(
        input.name,
        input.category,
        input.metal,
        input.purity,
        input.grossWeight,
        input.netWeight,
        input.makingCharges,
        input.imagePath,
        parent?.id ?? null,
        variantCode,
        input.size ?? '',
        input.stoneWeight ?? 0,
        input.stoneDetails ?? '',
        stringifyAttributes(input.attributes),
        input.isActive === false ? 0 : 1,
        id,
      )
      const willCreatePieces = !tracksPieces && openingPieces.length > 0 && input.trackPieces === true
      if (!tracksPieces && !willCreatePieces) {
        replaceHuids(db, id, huids)
      }
      const delta = input.stockQty - existing.stock_qty
      if (willCreatePieces) {
        const pieceNet = roundWeight(openingPieces.reduce((sum, piece) => sum + piece.netWeight, 0))
        const currentWeight = roundWeight(
          (
            db
              .prepare(
                `SELECT COALESCE(SUM(weight_delta), 0) AS weight
                 FROM stock_movements WHERE product_id = ?`,
              )
              .get(id) as { weight: number }
          ).weight,
        )
        const weightDelta = roundWeight(pieceNet - currentWeight)
        if (delta !== 0 || weightDelta !== 0) {
          recordPieceMovement(db, {
            type: 'adjustment',
            productId: id,
            qtyDelta: delta,
            weightDelta,
            refType: 'product',
            refId: id,
            reason: 'Product stock edit',
            operatorId: req.user?.id ?? null,
          })
        }
      } else if (delta !== 0) {
        recordPieceMovement(db, {
          type: 'adjustment',
          productId: id,
          qtyDelta: delta,
          refType: 'product',
          refId: id,
          reason: 'Product stock edit',
          operatorId: req.user?.id ?? null,
        })
      }
      if (willCreatePieces) {
        createOpeningPieces(db, id, openingPieces)
      } else if (!tracksPieces && input.trackPieces === true) {
        convertProductToTracked(db, id)
      }
      return requireProductRow(db, id)
    })
    const row = tx()
    res.json(mapProductRows(getDatabase(), [row])[0])
  }),
)

const PRODUCT_IN_USE_DELETE_MESSAGE =
  'This product is used on existing bills, so it cannot be deleted. Deactivate it instead.'

function isSqliteForeignKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return true
  if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
    const message = error instanceof Error ? error.message : String((error as { message?: string }).message ?? '')
    return /FOREIGN KEY/i.test(message)
  }
  return false
}

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const existing = getProductRow(db, id)
    if (!existing) {
      throw new Error('Product not found')
    }
    const childCount = countChildren(db, id)
    if (childCount > 0) {
      throw new Error(
        `This design has ${childCount} variant${childCount === 1 ? '' : 's'}. Delete them first.`,
      )
    }
    const pieceCount = (
      db.prepare('SELECT COUNT(*) AS count FROM inventory_pieces WHERE product_id = ?').get(id) as {
        count: number
      }
    ).count
    if (pieceCount > 0) {
      throw new Error(
        'This product has piece history from purchases or bills, so it cannot be deleted. Deactivate it instead.',
      )
    }
    const billLineCount = (
      db.prepare('SELECT COUNT(*) AS count FROM invoice_items WHERE product_id = ?').get(id) as {
        count: number
      }
    ).count
    if (billLineCount > 0) {
      throw new Error(PRODUCT_IN_USE_DELETE_MESSAGE)
    }
    let result
    try {
      result = db.prepare('DELETE FROM products WHERE id = ?').run(id)
    } catch (error) {
      if (isSqliteForeignKeyError(error)) {
        throw new Error(PRODUCT_IN_USE_DELETE_MESSAGE)
      }
      throw error
    }
    if (result.changes === 0) {
      throw new Error('Product not found')
    }
    res.status(204).end()
  }),
)

export default router
