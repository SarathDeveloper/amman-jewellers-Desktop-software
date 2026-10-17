import type Database from 'better-sqlite3'
import { assertMetalsOpenForDate } from '../db/metalDayClosing'
import { localTodayIso } from '@shared/localDate'
import { parseHuidsJson } from '../products/huids'
import { recordPieceMovement, recordWeightMovement } from '../stock/movements'
import { reversePiecesForInward } from '../stock/pieces'

export interface CancelInwardInput {
  inwardId: number
  reason: string
  operatorId: number | null
}

type InwardCancelRow = {
  id: number
  inward_no: string
  status: string
  source: string | null
  inward_date: string
}

type InwardCancelItem = {
  id: number
  product_id: number | null
  product_name: string | null
  metal: string
  category: string
  qty: number
  net_weight: number
  huids: string | null
}

function loadItems(db: Database.Database, inwardId: number): InwardCancelItem[] {
  return db
    .prepare(
      `SELECT ii.id, ii.product_id, p.name AS product_name, ii.metal, ii.category,
              ii.qty, ii.net_weight, ii.huids
       FROM inward_items ii
       LEFT JOIN products p ON p.id = ii.product_id
       WHERE ii.inward_id = ?
       ORDER BY ii.id`,
    )
    .all(inwardId) as InwardCancelItem[]
}

function isHuidTagged(db: Database.Database, productId: number, huid: string): boolean {
  return Boolean(
    db
      .prepare('SELECT 1 FROM product_huids WHERE product_id = ? AND huid = ?')
      .get(productId, huid),
  )
}

/**
 * Reverses a finalized purchase: stock, HUIDs and the metal ledger, then marks
 * the purchase cancelled. Everything runs inside the caller's transaction, so a
 * failed check leaves both the purchase and the stock untouched.
 *
 * The audit trail is kept: the original purchase row still exists with its
 * lines, and the reversal is a set of purchase_return movements pointing at it.
 */
export function cancelInward(db: Database.Database, input: CancelInwardInput): void {
  const row = db
    .prepare('SELECT id, inward_no, status, source, inward_date FROM inwards WHERE id = ?')
    .get(input.inwardId) as InwardCancelRow | undefined
  if (!row) {
    throw new Error('Inward not found')
  }
  if (row.status === 'cancelled') {
    throw new Error('This purchase is already cancelled')
  }
  if (row.status !== 'final') {
    throw new Error('Only a finalized purchase can be cancelled. Delete the draft instead.')
  }
  if ((row.source ?? 'purchase') !== 'purchase') {
    throw new Error('Stock addition entries cannot be cancelled. Adjust the stock instead.')
  }

  const items = loadItems(db, input.inwardId)
  const cancelDate = localTodayIso()
  assertMetalsOpenForDate(
    db,
    cancelDate,
    items.map((item) => item.metal),
  )

  for (const item of items) {
    const label = item.product_name || item.category || 'Purchase line'
    if (item.product_id == null) {
      const weight = item.net_weight * item.qty
      if (weight <= 0) continue
      recordWeightMovement(db, {
        type: 'purchase_return',
        metal: item.metal,
        category: item.category,
        weightDelta: -weight,
        refType: 'inward',
        refId: input.inwardId,
        reason: `Purchase ${row.inward_no} cancelled`,
        operatorId: input.operatorId,
        movementDate: cancelDate,
      })
      continue
    }

    const product = db
      .prepare('SELECT name, stock_qty, track_pieces FROM products WHERE id = ?')
      .get(item.product_id) as
      | { name: string; stock_qty: number; track_pieces: number }
      | undefined
    // Tracked pieces are reversed as pieces after this loop, which gives a
    // per-tag movement and refuses if any one of them was sold.
    if (product?.track_pieces === 1) continue

    const stockQty = product?.stock_qty ?? 0
    if (stockQty < item.qty) {
      throw new Error(
        `${label} has only ${stockQty} of ${item.qty} pieces left in stock. ` +
          'Cancel the sale bill that used them first.',
      )
    }

    // A HUID that has left this product means some of the purchased pieces were
    // already sold or moved; reversing would corrupt the tag ledger.
    const huids = parseHuidsJson(item.huids)
    const missing = huids.find((huid) => !isHuidTagged(db, item.product_id as number, huid))
    if (missing) {
      throw new Error(
        `${label}: HUID ${missing} is no longer in stock. ` +
          'Cancel the sale bill that used it first.',
      )
    }

    recordPieceMovement(db, {
      type: 'purchase_return',
      productId: item.product_id,
      qtyDelta: -item.qty,
      weightDelta: -(item.net_weight * item.qty),
      refType: 'inward',
      refId: input.inwardId,
      reason: `Purchase ${row.inward_no} cancelled`,
      operatorId: input.operatorId,
      movementDate: cancelDate,
    })

    if (huids.length > 0) {
      const del = db.prepare('DELETE FROM product_huids WHERE product_id = ? AND huid = ?')
      for (const huid of huids) {
        del.run(item.product_id, huid)
      }
    }
  }

  reversePiecesForInward(db, {
    inwardId: input.inwardId,
    inwardNo: row.inward_no,
    operatorId: input.operatorId,
    movementDate: cancelDate,
  })

  const result = db
    .prepare(
      `UPDATE inwards
       SET status = 'cancelled', cancelled_at = datetime('now'), cancel_reason = ?, cancelled_by = ?
       WHERE id = ? AND status = 'final'`,
    )
    .run(input.reason.trim(), input.operatorId, input.inwardId)
  if (result.changes !== 1) {
    throw new Error('This purchase is already cancelled')
  }
}
