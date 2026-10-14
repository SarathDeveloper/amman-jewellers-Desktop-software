import type Database from 'better-sqlite3'
import { newPieceHuidError } from '@shared/itemTypes'
import { appendHuids } from '../products/huids'
import { recordPieceMovement, recordWeightMovement } from '../stock/movements'

export type InwardStockItem = {
  productId: number | null
  productName?: string | null
  metal: string
  category: string
  qty: number
  netWeight: number
  huids?: string[]
}

/** Applies HUIDs and purchase movements for a draft inward, then marks it final. */
export function applyInwardStock(
  db: Database.Database,
  input: {
    inwardId: number
    inwardDate: string
    items: InwardStockItem[]
    operatorId: number | null
  },
): void {
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
    const huidError = newPieceHuidError((item.huids ?? []).length, item.qty)
    if (huidError) {
      throw new Error(`${item.productName ?? 'Product line'}: ${huidError}`)
    }
    appendHuids(db, item.productId, item.huids ?? [])
    recordPieceMovement(db, {
      type: 'purchase',
      productId: item.productId,
      qtyDelta: item.qty,
      weightDelta: item.netWeight * item.qty,
      refType: 'inward',
      refId: input.inwardId,
      reason: 'Inward finalize',
      operatorId: input.operatorId,
      movementDate: input.inwardDate,
    })
  }

  db.prepare(
    `UPDATE inwards SET status = 'final', finalized_at = datetime('now') WHERE id = ?`,
  ).run(input.inwardId)
}
