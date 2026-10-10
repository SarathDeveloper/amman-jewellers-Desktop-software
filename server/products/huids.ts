import type Database from 'better-sqlite3'
import { newPieceHuidError } from '@shared/itemTypes'

export function loadHuidsFor(db: Database.Database, ids: number[]): Map<number, string[]> {
  const byProduct = new Map<number, string[]>()
  if (ids.length === 0) return byProduct
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT product_id, huid FROM product_huids
       WHERE product_id IN (${placeholders})
       ORDER BY id`,
    )
    .all(...ids) as Array<{ product_id: number; huid: string }>
  for (const row of rows) {
    const list = byProduct.get(row.product_id)
    if (list) {
      list.push(row.huid)
    } else {
      byProduct.set(row.product_id, [row.huid])
    }
  }
  return byProduct
}

export function listHuids(db: Database.Database, productId: number): string[] {
  return loadHuidsFor(db, [productId]).get(productId) ?? []
}

export function assertUniqueHuids(
  db: Database.Database,
  huids: string[],
  excludeProductId?: number,
): void {
  if (huids.length === 0) return
  const placeholders = huids.map(() => '?').join(', ')
  const existing = db
    .prepare(
      `SELECT ph.huid AS huid, p.name AS name
       FROM product_huids ph
       JOIN products p ON p.id = ph.product_id
       WHERE ph.huid IN (${placeholders})
         AND (? IS NULL OR ph.product_id != ?)`,
    )
    .get(...huids, excludeProductId ?? null, excludeProductId ?? null) as
    | { huid: string; name: string }
    | undefined
  if (existing) {
    throw new Error(`HUID ${existing.huid} is already used by ${existing.name}`)
  }
}

export function replaceHuids(db: Database.Database, productId: number, huids: string[]): void {
  db.prepare('DELETE FROM product_huids WHERE product_id = ?').run(productId)
  const insert = db.prepare('INSERT INTO product_huids (product_id, huid) VALUES (?, ?)')
  for (const huid of huids) {
    insert.run(productId, huid)
  }
}

export function appendHuids(db: Database.Database, productId: number, huids: string[]): void {
  if (huids.length === 0) return
  const seen = new Set<string>()
  for (const huid of huids) {
    if (seen.has(huid)) {
      throw new Error(`HUID ${huid} is duplicated`)
    }
    seen.add(huid)
  }
  assertUniqueHuids(db, huids)
  const insert = db.prepare('INSERT INTO product_huids (product_id, huid) VALUES (?, ?)')
  for (const huid of huids) {
    insert.run(productId, huid)
  }
}

export function removeHuids(db: Database.Database, productId: number, huids: string[]): void {
  const del = db.prepare('DELETE FROM product_huids WHERE product_id = ? AND huid = ?')
  for (const huid of huids) {
    const result = del.run(productId, huid)
    if (result.changes === 0) {
      throw new Error(`HUID ${huid} is not tagged on this product`)
    }
  }
}

export function parseHuidsJson(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      .map((value) => value.trim().toUpperCase())
  } catch {
    return []
  }
}

export function stringifyHuids(huids: string[] | undefined): string {
  return JSON.stringify(huids ?? [])
}

export function requireHuidsForNewPieces(huids: string[], qty: number): void {
  if (qty <= 0) return
  const error = newPieceHuidError(huids.length, qty)
  if (error) {
    throw new Error(error)
  }
}
