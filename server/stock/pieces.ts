import type Database from 'better-sqlite3'
import { allocatePieceCosts } from '@shared/billing/pieceCosts'
import { roundWeight } from '@shared/billing/pricing'
import type {
  InwardPieceInput,
  InventoryPiece,
  InventoryPieceStatus,
  InventoryPieceUpdateInput,
} from '@shared/types'
import { assertUniqueHuids } from '../products/huids'
import { recordPieceMovement } from './movements'

export interface PieceRow {
  id: number
  product_id: number
  tag_code: string
  huid: string
  gross_weight: number
  stone_weight: number
  net_weight: number
  cost: number | null
  status: InventoryPieceStatus
  inward_id: number | null
  inward_item_id: number | null
  invoice_id: number | null
  invoice_item_id: number | null
  created_at: string
  updated_at: string
}

type ProductPieceRow = {
  id: number
  name: string
  track_pieces: number
  stock_qty: number
  net_weight: number
  gross_weight: number
  stone_weight: number
}

function mapPiece(row: PieceRow, extra: Partial<InventoryPiece> = {}): InventoryPiece {
  return {
    id: row.id,
    productId: row.product_id,
    tagCode: row.tag_code,
    huid: row.huid,
    grossWeight: row.gross_weight,
    stoneWeight: row.stone_weight,
    netWeight: row.net_weight,
    cost: row.cost,
    status: row.status,
    inwardId: row.inward_id,
    inwardItemId: row.inward_item_id,
    invoiceId: row.invoice_id,
    invoiceItemId: row.invoice_item_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  }
}

function loadProduct(db: Database.Database, productId: number): ProductPieceRow {
  const row = db
    .prepare(
      `SELECT id, name, track_pieces, stock_qty, net_weight, gross_weight, stone_weight
       FROM products WHERE id = ?`,
    )
    .get(productId) as ProductPieceRow | undefined
  if (!row) {
    throw new Error('Product not found')
  }
  return row
}

export function loadPiece(db: Database.Database, pieceId: number): PieceRow | undefined {
  return db.prepare('SELECT * FROM inventory_pieces WHERE id = ?').get(pieceId) as
    | PieceRow
    | undefined
}

/** `T000001`, `T000002`, … from the highest tag already issued. */
export function nextPieceTag(db: Database.Database): string {
  const row = db
    .prepare(
      `SELECT MAX(CAST(substr(tag_code, 2) AS INTEGER)) AS max_tag
       FROM inventory_pieces
       WHERE tag_code GLOB 'T[0-9]*'`,
    )
    .get() as { max_tag: number | null } | undefined
  const next = (row?.max_tag ?? 0) + 1
  return `T${String(next).padStart(6, '0')}`
}

export function isProductTracked(db: Database.Database, productId: number): boolean {
  const row = db.prepare('SELECT track_pieces FROM products WHERE id = ?').get(productId) as
    | { track_pieces: number }
    | undefined
  return (row?.track_pieces ?? 0) === 1
}

/**
 * Creates the piece rows for one finalized purchase line. It does not change
 * `products.stock_qty`: the caller's line-level `recordPieceMovement` does that
 * in the same transaction, and `assertPieceCount` checks the two agree.
 *
 * Cost is `net * rate + making`, less this line's share of the purchase
 * discount, allocated by each piece's share of the line amount. GST is excluded
 * because it is input tax, not inventory cost.
 */
export function createPiecesForInwardLine(
  db: Database.Database,
  input: {
    inwardId: number
    inwardItemId: number
    productId: number
    pieces: InwardPieceInput[]
    qty: number
    netWeight: number
    rate: number
    makingCharges: number
    /** This line's share of the purchase-level discount, before tax. */
    lineDiscount: number
  },
): number[] {
  const product = loadProduct(db, input.productId)
  const rows: InwardPieceInput[] =
    input.pieces.length > 0
      ? input.pieces
      : Array.from({ length: input.qty }, () => ({
          netWeight: input.netWeight,
          grossWeight: input.netWeight,
          stoneWeight: 0,
        }))

  const bases = allocatePieceCosts({
    netWeights: rows.map((piece) => piece.netWeight),
    rate: input.rate,
    makingCharges: input.makingCharges,
    lineDiscount: input.lineDiscount,
  })

  const insert = db.prepare(
    `INSERT INTO inventory_pieces (
       product_id, tag_code, huid, gross_weight, stone_weight, net_weight, cost, status,
       inward_id, inward_item_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'in_stock', ?, ?, datetime('now'), datetime('now'))`,
  )
  const ids: number[] = []
  rows.forEach((piece, index) => {
    const tag = (piece.tagCode ?? '').trim().toUpperCase() || nextPieceTag(db)
    const taken = db.prepare('SELECT 1 FROM inventory_pieces WHERE tag_code = ?').get(tag)
    if (taken) {
      throw new Error(`Tag ${tag} is already in use`)
    }
    const huid = (piece.huid ?? '').trim().toUpperCase()
    if (huid) {
      assertUniqueHuids(db, [huid])
    }
    const cost = bases[index]
    const result = insert.run(
      product.id,
      tag,
      huid,
      roundWeight(Math.max(0, piece.grossWeight ?? piece.netWeight)),
      roundWeight(Math.max(0, piece.stoneWeight ?? 0)),
      roundWeight(piece.netWeight),
      cost,
      input.inwardId,
      input.inwardItemId,
    )
    const pieceId = Number(result.lastInsertRowid)
    ids.push(pieceId)
    if (huid) {
      db.prepare(
        'INSERT INTO product_huids (product_id, huid, piece_id) VALUES (?, ?, ?)',
      ).run(product.id, huid, pieceId)
    }
  })
  return ids
}

/** Every piece created by one purchase, for the cancel path. */
export function piecesForInward(db: Database.Database, inwardId: number): PieceRow[] {
  return db
    .prepare('SELECT * FROM inventory_pieces WHERE inward_id = ? ORDER BY id')
    .all(inwardId) as PieceRow[]
}

/**
 * Reverses a whole purchase's pieces. Refused unless every piece is still in
 * stock, so a sale must be cancelled first rather than silently losing a piece.
 */
export function reversePiecesForInward(
  db: Database.Database,
  input: {
    inwardId: number
    inwardNo: string
    operatorId: number | null
    movementDate: string
  },
): number {
  const rows = piecesForInward(db, input.inwardId)
  if (rows.length === 0) return 0

  const notInStock = rows.find((row) => row.status !== 'in_stock')
  if (notInStock) {
    const product = db
      .prepare('SELECT name FROM products WHERE id = ?')
      .get(notInStock.product_id) as { name: string } | undefined
    const bill = notInStock.invoice_id
      ? (db.prepare('SELECT invoice_no FROM invoices WHERE id = ?').get(notInStock.invoice_id) as
          | { invoice_no: string }
          | undefined)
      : undefined
    throw new Error(
      `${product?.name ?? 'A piece'} ${notInStock.tag_code} is already ${
        notInStock.status === 'sold' ? 'sold' : notInStock.status
      }${bill ? ` on bill ${bill.invoice_no}` : ''}. Cancel that bill first.`,
    )
  }

  for (const row of rows) {
    recordPieceMovement(db, {
      type: 'purchase_return',
      productId: row.product_id,
      qtyDelta: -1,
      weightDelta: -row.net_weight,
      refType: 'inward',
      refId: input.inwardId,
      reason: `Purchase ${input.inwardNo} cancelled · ${row.tag_code}`,
      operatorId: input.operatorId,
      movementDate: input.movementDate,
    })
    db.prepare(
      `UPDATE inventory_pieces SET status = 'reversed', updated_at = datetime('now')
       WHERE id = ? AND status = 'in_stock'`,
    ).run(row.id)
    db.prepare('DELETE FROM product_huids WHERE piece_id = ?').run(row.id)
  }
  for (const productId of new Set(rows.map((row) => row.product_id))) {
    assertPieceCount(db, productId)
  }
  return rows.length
}

/**
 * Records a hallmark on a piece that does not have one yet. Refused when the
 * code is already on another piece or another product.
 */
export function assignHuidToPiece(db: Database.Database, piece: PieceRow, huid: string): void {
  const next = huid.trim().toUpperCase()
  if (!next) return
  if (!/^[0-9A-Z]+$/.test(next)) {
    throw new Error('HUID can only be letters and digits')
  }
  const current = (piece.huid ?? '').trim().toUpperCase()
  if (current === next) return
  if (current) {
    throw new Error(`Tag ${piece.tag_code} already has HUID ${current}`)
  }
  const otherPiece = db
    .prepare('SELECT tag_code FROM inventory_pieces WHERE huid = ? AND id != ?')
    .get(next, piece.id) as { tag_code: string } | undefined
  if (otherPiece) {
    throw new Error(`HUID ${next} is already on tag ${otherPiece.tag_code}`)
  }
  assertUniqueHuids(db, [next])
  const updated = db
    .prepare(
      `UPDATE inventory_pieces SET huid = ?, updated_at = datetime('now')
       WHERE id = ? AND huid = ''`,
    )
    .run(next, piece.id)
  if (updated.changes !== 1) {
    throw new Error(`Tag ${piece.tag_code} already has a HUID`)
  }
  db.prepare('INSERT INTO product_huids (product_id, huid, piece_id) VALUES (?, ?, ?)').run(
    piece.product_id,
    next,
    piece.id,
  )
  piece.huid = next
}

/**
 * Sells one tracked piece on a final bill: writes the sale movement, flips the
 * piece to sold, links the invoice line and drops its HUID tag.
 */
export function sellPiece(
  db: Database.Database,
  input: {
    pieceId: number
    productId: number
    invoiceId: number
    invoiceItemId: number
    invoiceNo: string
    movementDate: string
    operatorId: number | null
  },
): PieceRow {
  const piece = loadPiece(db, input.pieceId)
  if (!piece) {
    throw new Error('Piece not found')
  }
  if (piece.product_id !== input.productId) {
    throw new Error(`Tag ${piece.tag_code} belongs to another product`)
  }
  if (piece.status !== 'in_stock') {
    throw new Error(
      piece.status === 'sold'
        ? `Tag ${piece.tag_code} is already sold${
            piece.invoice_id
              ? ` on bill ${
                  (
                    db.prepare('SELECT invoice_no FROM invoices WHERE id = ?').get(piece.invoice_id) as
                      | { invoice_no: string }
                      | undefined
                  )?.invoice_no ?? ''
                }`
              : ''
          }`
        : `Tag ${piece.tag_code} is ${piece.status}`,
    )
  }

  recordPieceMovement(db, {
    type: 'sale',
    productId: piece.product_id,
    qtyDelta: -1,
    weightDelta: -piece.net_weight,
    refType: 'invoice',
    refId: input.invoiceId,
    reason: `Bill ${input.invoiceNo} · ${piece.tag_code}`,
    operatorId: input.operatorId,
    movementDate: input.movementDate,
  })
  db.prepare(
    `UPDATE inventory_pieces
     SET status = 'sold', invoice_id = ?, invoice_item_id = ?, updated_at = datetime('now')
     WHERE id = ? AND status = 'in_stock'`,
  ).run(input.invoiceId, input.invoiceItemId, piece.id)
  db.prepare('DELETE FROM product_huids WHERE piece_id = ?').run(piece.id)
  assertPieceCount(db, piece.product_id)
  return piece
}

/** Puts a sold piece back in stock when its bill is cancelled. */
export function restorePiece(
  db: Database.Database,
  input: {
    pieceId: number
    invoiceId: number
    invoiceNo: string
    movementDate: string
    operatorId: number | null
  },
): PieceRow {
  const piece = loadPiece(db, input.pieceId)
  if (!piece) {
    throw new Error('Piece not found')
  }
  if (piece.invoice_id !== input.invoiceId) {
    throw new Error(`Tag ${piece.tag_code} was not sold on this bill`)
  }
  if (piece.status !== 'sold') {
    throw new Error(`Tag ${piece.tag_code} cannot be restored from ${piece.status}`)
  }

  recordPieceMovement(db, {
    type: 'sales_return',
    productId: piece.product_id,
    qtyDelta: 1,
    weightDelta: piece.net_weight,
    refType: 'invoice',
    refId: input.invoiceId,
    reason: `Bill ${input.invoiceNo} cancelled · ${piece.tag_code}`,
    operatorId: input.operatorId,
    movementDate: input.movementDate,
  })
  db.prepare(
    `UPDATE inventory_pieces
     SET status = 'in_stock', invoice_id = NULL, invoice_item_id = NULL,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(piece.id)

  if (piece.huid) {
    const tagged = db
      .prepare('SELECT 1 FROM product_huids WHERE huid = ?')
      .get(piece.huid)
    if (!tagged) {
      db.prepare(
        'INSERT INTO product_huids (product_id, huid, piece_id) VALUES (?, ?, ?)',
      ).run(piece.product_id, piece.huid, piece.id)
    } else {
      db.prepare('UPDATE product_huids SET piece_id = ? WHERE huid = ?').run(piece.id, piece.huid)
    }
  }
  assertPieceCount(db, piece.product_id)
  return piece
}

/** Marks a piece damaged or lost and removes it from saleable stock. */
export function markPieceStatus(
  db: Database.Database,
  input: {
    pieceId: number
    status: Extract<InventoryPieceStatus, 'damaged' | 'lost'>
    reason: string
    movementDate: string
    operatorId: number | null
  },
): PieceRow {
  const piece = loadPiece(db, input.pieceId)
  if (!piece) {
    throw new Error('Piece not found')
  }
  if (piece.status !== 'in_stock') {
    throw new Error(`Tag ${piece.tag_code} is not in stock`)
  }
  recordPieceMovement(db, {
    type: input.status,
    productId: piece.product_id,
    qtyDelta: -1,
    weightDelta: -piece.net_weight,
    refType: 'adjustment',
    refId: null,
    reason: `${input.reason || input.status} · ${piece.tag_code}`,
    operatorId: input.operatorId,
    movementDate: input.movementDate,
  })
  db.prepare(
    `UPDATE inventory_pieces SET status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(input.status, piece.id)
  db.prepare('DELETE FROM product_huids WHERE piece_id = ?').run(piece.id)
  assertPieceCount(db, piece.product_id)
  return piece
}

/**
 * Opening stock typed on the product form: one piece per row, with that row's
 * own weight and optional HUID. `stock_qty` is already the row count.
 */
export function createOpeningPieces(
  db: Database.Database,
  productId: number,
  pieces: InwardPieceInput[],
): void {
  const product = loadProduct(db, productId)
  if (product.track_pieces === 1) {
    throw new Error('This product already tracks each piece')
  }
  if (pieces.length !== product.stock_qty) {
    throw new Error('Enter one row for each piece in stock')
  }
  const draftBill = db
    .prepare(
      `SELECT i.invoice_no AS invoice_no
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE ii.product_id = ? AND i.status = 'draft'
       LIMIT 1`,
    )
    .get(productId) as { invoice_no: string } | undefined
  if (draftBill) {
    throw new Error(
      `This product is on open draft bill ${draftBill.invoice_no}. Finish or delete that draft first.`,
    )
  }

  const huids = pieces
    .map((piece) => (piece.huid ?? '').trim().toUpperCase())
    .filter((huid) => huid.length > 0)
  assertUniqueHuids(db, huids, productId)
  db.prepare('DELETE FROM product_huids WHERE product_id = ?').run(productId)

  const insert = db.prepare(
    `INSERT INTO inventory_pieces (
       product_id, tag_code, huid, gross_weight, stone_weight, net_weight, cost, status,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'in_stock', datetime('now'), datetime('now'))`,
  )
  const insertHuid = db.prepare(
    'INSERT INTO product_huids (product_id, huid, piece_id) VALUES (?, ?, ?)',
  )
  for (const piece of pieces) {
    const tag = nextPieceTag(db)
    const huid = (piece.huid ?? '').trim().toUpperCase()
    const enteredGross = piece.grossWeight ?? 0
    const gross = roundWeight(enteredGross > 0 ? enteredGross : piece.netWeight)
    const stone = roundWeight(Math.max(0, piece.stoneWeight ?? 0))
    const net = roundWeight(piece.netWeight)
    if (gross > 0 && net > gross) {
      throw new Error(`Net weight cannot exceed gross weight`)
    }
    const result = insert.run(product.id, tag, huid, gross, stone, net)
    if (huid) {
      insertHuid.run(product.id, huid, Number(result.lastInsertRowid))
    }
  }
  db.prepare(
    `UPDATE products SET track_pieces = 1, updated_at = datetime('now') WHERE id = ?`,
  ).run(productId)
  assertPieceCount(db, productId)
}

/**
 * One-way switch to piece tracking for an existing product. Creates `stock_qty`
 * pieces at the design's net weight and attaches the existing HUIDs in order.
 * `stock_qty` is left untouched, so the invariant holds immediately.
 */
export function convertProductToTracked(db: Database.Database, productId: number): void {
  const product = loadProduct(db, productId)
  if (product.track_pieces === 1) {
    throw new Error('This product already tracks each piece')
  }
  const draftBill = db
    .prepare(
      `SELECT i.invoice_no AS invoice_no
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE ii.product_id = ? AND i.status = 'draft'
       LIMIT 1`,
    )
    .get(productId) as { invoice_no: string } | undefined
  if (draftBill) {
    throw new Error(
      `This product is on open draft bill ${draftBill.invoice_no}. Finish or delete that draft first.`,
    )
  }

  const huids = db
    .prepare('SELECT id, huid FROM product_huids WHERE product_id = ? ORDER BY id')
    .all(productId) as Array<{ id: number; huid: string }>
  if (huids.length > product.stock_qty) {
    throw new Error(
      `This product has ${huids.length} HUIDs but only ${product.stock_qty} pieces in stock. Fix the stock first.`,
    )
  }

  const insert = db.prepare(
    `INSERT INTO inventory_pieces (
       product_id, tag_code, huid, gross_weight, stone_weight, net_weight, cost, status,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'in_stock', datetime('now'), datetime('now'))`,
  )
  for (let index = 0; index < product.stock_qty; index += 1) {
    const tag = nextPieceTag(db)
    const huid = huids[index]?.huid ?? ''
    const result = insert.run(
      product.id,
      tag,
      huid,
      product.gross_weight,
      product.stone_weight,
      product.net_weight,
    )
    if (huids[index]) {
      db.prepare('UPDATE product_huids SET piece_id = ? WHERE id = ?').run(
        Number(result.lastInsertRowid),
        huids[index].id,
      )
    }
  }
  db.prepare(
    `UPDATE products SET track_pieces = 1, updated_at = datetime('now') WHERE id = ?`,
  ).run(productId)
  assertPieceCount(db, productId)
}

/** Guards every tracked-stock change: cached `stock_qty` must equal in-stock pieces. */
export function assertPieceCount(db: Database.Database, productId: number): void {
  const product = loadProduct(db, productId)
  if (product.track_pieces !== 1) return
  const count = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM inventory_pieces
         WHERE product_id = ? AND status = 'in_stock'`,
      )
      .get(productId) as { count: number }
  ).count
  if (count !== product.stock_qty) {
    throw new Error(
      `Piece count for ${product.name} is out of sync: ${count} in-stock piece${
        count === 1 ? '' : 's'
      } but stock quantity is ${product.stock_qty}`,
    )
  }
}

/**
 * Patches in-stock pieces from the product edit form. Tag codes stay fixed.
 * Net-weight changes write a qty-0 adjustment movement so category weight
 * ledgers stay aligned. HUID changes sync `product_huids`.
 */
export function updateInStockPieces(
  db: Database.Database,
  productId: number,
  updates: InventoryPieceUpdateInput[],
): InventoryPiece[] {
  if (updates.length === 0) {
    return listPiecesForProduct(db, productId)
  }

  const product = loadProduct(db, productId)
  if (product.track_pieces !== 1) {
    throw new Error('This product does not track pieces')
  }

  const updateIds = new Set(updates.map((row) => row.id))
  const resolved: Array<{
    piece: PieceRow
    huid: string
    gross: number
    stone: number
    net: number
    cost: number | null
  }> = []

  const seenHuids = new Map<string, number>()
  for (const input of updates) {
    const piece = loadPiece(db, input.id)
    if (!piece) {
      throw new Error('Piece not found')
    }
    if (piece.product_id !== productId) {
      throw new Error(`Tag ${piece.tag_code} belongs to another product`)
    }
    if (piece.status !== 'in_stock') {
      throw new Error(`Tag ${piece.tag_code} is ${piece.status} and cannot be edited`)
    }

    const huid = (input.huid ?? '').trim().toUpperCase()
    if (huid && !/^[0-9A-Z]+$/.test(huid)) {
      throw new Error('HUID can only be letters and digits')
    }
    if (huid) {
      const prior = seenHuids.get(huid)
      if (prior !== undefined && prior !== input.id) {
        throw new Error(`HUID ${huid} is duplicated`)
      }
      seenHuids.set(huid, input.id)
    }

    const enteredGross = input.grossWeight ?? 0
    const gross = roundWeight(enteredGross > 0 ? enteredGross : input.netWeight)
    const stone = roundWeight(Math.max(0, input.stoneWeight ?? 0))
    const net = roundWeight(input.netWeight)
    if (gross > 0 && net > gross) {
      throw new Error(`Net weight cannot exceed gross weight for tag ${piece.tag_code}`)
    }
    if (stone > gross) {
      throw new Error(`Stone weight cannot exceed gross weight for tag ${piece.tag_code}`)
    }
    if (input.cost != null && input.cost < 0) {
      throw new Error(`Cost cannot be negative for tag ${piece.tag_code}`)
    }

    resolved.push({ piece, huid, gross, stone, net, cost: input.cost })
  }

  for (const { piece, huid } of resolved) {
    if (!huid) continue
    const otherPiece = db
      .prepare('SELECT id, tag_code FROM inventory_pieces WHERE huid = ? AND id != ?')
      .get(huid, piece.id) as { id: number; tag_code: string } | undefined
    if (otherPiece && !updateIds.has(otherPiece.id)) {
      throw new Error(`HUID ${huid} is already on tag ${otherPiece.tag_code}`)
    }
  }

  const huidsForAssert = [...seenHuids.keys()]
  assertUniqueHuids(db, huidsForAssert, productId)

  const clearHuidRow = db.prepare(
    `DELETE FROM product_huids
     WHERE product_id = ? AND (piece_id = ? OR (piece_id IS NULL AND huid = ?))`,
  )
  const insertHuid = db.prepare(
    'INSERT INTO product_huids (product_id, huid, piece_id) VALUES (?, ?, ?)',
  )
  const clearPieceHuid = db.prepare(
    `UPDATE inventory_pieces SET huid = '', updated_at = datetime('now')
     WHERE id = ? AND status = 'in_stock'`,
  )
  const updateRow = db.prepare(
    `UPDATE inventory_pieces
     SET huid = ?, gross_weight = ?, stone_weight = ?, net_weight = ?, cost = ?,
         updated_at = datetime('now')
     WHERE id = ? AND status = 'in_stock'`,
  )

  // Clear first so HUID swaps within the same batch do not clash mid-update.
  for (const { piece } of resolved) {
    const previousHuid = (piece.huid ?? '').trim().toUpperCase()
    clearHuidRow.run(productId, piece.id, previousHuid)
    clearPieceHuid.run(piece.id)
  }

  for (const { piece, huid, gross, stone, net, cost } of resolved) {
    const result = updateRow.run(huid, gross, stone, net, cost, piece.id)
    if (result.changes !== 1) {
      throw new Error(`Tag ${piece.tag_code} is no longer in stock`)
    }
    if (huid) {
      insertHuid.run(productId, huid, piece.id)
    }

    const weightDelta = roundWeight(net - piece.net_weight)
    if (weightDelta !== 0) {
      recordPieceMovement(db, {
        type: 'adjustment',
        productId,
        qtyDelta: 0,
        weightDelta,
        refType: 'inventory_piece',
        refId: piece.id,
        reason: `Corrected tag ${piece.tag_code}`,
      })
    }
  }

  assertPieceCount(db, productId)
  return listPiecesForProduct(db, productId)
}

/** In-stock pieces for the bill product picker, oldest first. */
export function listInStockPieces(db: Database.Database, productId: number): InventoryPiece[] {
  return (
    db
      .prepare(
        `SELECT * FROM inventory_pieces
         WHERE product_id = ? AND status = 'in_stock'
         ORDER BY id`,
      )
      .all(productId) as PieceRow[]
  ).map((row) => mapPiece(row))
}

/** All pieces of a product for its Pieces tab, newest first. */
export function listPiecesForProduct(db: Database.Database, productId: number): InventoryPiece[] {
  const rows = db
    .prepare(
      `SELECT p.*, i.inward_no AS inward_no, v.invoice_no AS invoice_no
       FROM inventory_pieces p
       LEFT JOIN inwards i ON i.id = p.inward_id
       LEFT JOIN invoices v ON v.id = p.invoice_id
       WHERE p.product_id = ?
       ORDER BY p.id DESC`,
    )
    .all(productId) as Array<PieceRow & { inward_no: string | null; invoice_no: string | null }>
  return rows.map((row) =>
    mapPiece(row, {
      inwardNo: row.inward_no ?? '',
      invoiceNo: row.invoice_no ?? '',
    }),
  )
}

/** Finds a piece by exact tag or HUID, for scanning on a bill. */
export function findPieceByTagOrHuid(
  db: Database.Database,
  term: string,
): InventoryPiece | undefined {
  const value = term.trim().toUpperCase()
  if (!value) return undefined
  const row = db
    .prepare(
      `SELECT * FROM inventory_pieces
       WHERE upper(tag_code) = ? OR (huid != '' AND upper(huid) = ?)
       LIMIT 1`,
    )
    .get(value, value) as PieceRow | undefined
  return row ? mapPiece(row) : undefined
}

/**
 * A piece cannot be on two live bills. Drafts reserve it the same way HUIDs are
 * reserved; a cancelled bill releases it.
 */
export function assertPieceAvailableForBill(
  db: Database.Database,
  pieceId: number,
  invoiceId?: number,
): void {
  const otherBill = db
    .prepare(
      `SELECT i.invoice_no AS invoice_no
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE ii.piece_id = ? AND i.status != 'cancelled' AND i.id != ?
       LIMIT 1`,
    )
    .get(pieceId, invoiceId ?? -1) as { invoice_no: string } | undefined
  if (otherBill) {
    throw new Error(`This piece is already on bill ${otherBill.invoice_no}`)
  }
}
