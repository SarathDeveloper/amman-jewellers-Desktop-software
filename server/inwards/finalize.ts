import type Database from 'better-sqlite3'
import { newPieceHuidError } from '@shared/itemTypes'
import type { InwardPieceInput } from '@shared/types'
import { roundMoney } from '@shared/billing/pricing'
import { appendHuids } from '../products/huids'
import { recordPieceMovement, recordWeightMovement } from '../stock/movements'
import { assertPieceCount, createPiecesForInwardLine } from '../stock/pieces'

export type InwardStockItem = {
  id?: number
  productId: number | null
  productName?: string | null
  metal: string
  category: string
  qty: number
  grossWeight?: number
  netWeight: number
  huids?: string[]
  pieces?: InwardPieceInput[]
  rate?: number
  makingCharges?: number
  lineTotal?: number
}

/** Applies HUIDs and purchase movements for a draft inward, then marks it final. */
export function applyInwardStock(
  db: Database.Database,
  input: {
    inwardId: number
    inwardDate: string
    items: InwardStockItem[]
    operatorId: number | null
    /** Purchase-level discount, allocated across lines by their line total. */
    discount?: number
    subtotal?: number
  },
): void {
  const subtotal = Math.max(0, input.subtotal ?? 0)
  const discount = Math.max(0, input.discount ?? 0)

  for (const item of input.items) {
    if (item.productId == null) {
      const weight = item.netWeight * item.qty
      if (weight <= 0) continue
      recordWeightMovement(db, {
        type: 'purchase',
        metal: item.metal,
        category: item.category,
        weightDelta: weight,
        refType: 'inward',
        refId: input.inwardId,
        reason: 'Raw metal inward',
        operatorId: input.operatorId,
        movementDate: input.inwardDate,
      })
      continue
    }

    const product = db
      .prepare('SELECT name, track_pieces FROM products WHERE id = ?')
      .get(item.productId) as { name: string; track_pieces: number } | undefined
    const pieces = item.pieces ?? []
    const weight =
      pieces.length > 0
        ? pieces.reduce((sum, piece) => sum + piece.netWeight, 0)
        : item.netWeight * item.qty
    const lineDiscount =
      subtotal > 0 ? roundMoney(discount * ((item.lineTotal ?? 0) / subtotal)) : 0

    if (product?.track_pieces === 1 && item.id != null) {
      const effectivePieces: InwardPieceInput[] =
        pieces.length > 0
          ? pieces
          : Array.from({ length: item.qty }, (_, index) => ({
              huid: (item.huids ?? [])[index] ?? '',
              grossWeight: item.grossWeight || item.netWeight,
              stoneWeight: 0,
              netWeight: item.netWeight,
            }))
      createPiecesForInwardLine(db, {
        inwardId: input.inwardId,
        inwardItemId: item.id,
        productId: item.productId,
        pieces: effectivePieces,
        qty: item.qty,
        netWeight: item.netWeight,
        rate: item.rate ?? 0,
        makingCharges: item.makingCharges ?? 0,
        lineDiscount,
      })
      recordPieceMovement(db, {
        type: 'purchase',
        productId: item.productId,
        qtyDelta: item.qty,
        weightDelta: weight,
        refType: 'inward',
        refId: input.inwardId,
        reason: 'Inward finalize',
        operatorId: input.operatorId,
        movementDate: input.inwardDate,
      })
      assertPieceCount(db, item.productId)
      continue
    }

    const huidError = newPieceHuidError((item.huids ?? []).length, item.qty)
    if (huidError) {
      throw new Error(`${item.productName ?? 'Product line'}: ${huidError}`)
    }
    appendHuids(db, item.productId, item.huids ?? [])
    recordPieceMovement(db, {
      type: 'purchase',
      productId: item.productId,
      qtyDelta: item.qty,
      weightDelta: weight,
      refType: 'inward',
      refId: input.inwardId,
      reason: 'Inward finalize',
      operatorId: input.operatorId,
      movementDate: input.inwardDate,
    })
  }

  const result = db
    .prepare(
      `UPDATE inwards SET status = 'final', finalized_at = datetime('now')
       WHERE id = ? AND status = 'draft'`,
    )
    .run(input.inwardId)
  // Defence in depth: the route already refuses a non-draft inward, but if two
  // finalize calls ever race, only the one that flips 'draft' to 'final' wins.
  // Stock movements are written in the same transaction, so the loser rolls back.
  if (result.changes !== 1) {
    throw new Error('Only draft inwards can be modified')
  }
}
