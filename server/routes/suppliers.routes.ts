import { Router } from 'express'
import { supplierInputSchema } from '@shared/schemas'
import type { Supplier, SupplierInput } from '@shared/types'
import { getDatabase } from '../db'
import { asyncHandler, HttpError, parseBody, parseIdParam } from '../lib/http'

const router = Router()

type SupplierRow = {
  id: number
  name: string
  phone: string
  address: string
  notes: string
  gstin: string
  is_system: number | null
  created_at: string
}

function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    gstin: row.gstin ?? '',
    isSystem: Boolean(row.is_system),
    createdAt: row.created_at,
  }
}

function getSupplierRow(db: ReturnType<typeof getDatabase>, id: number): SupplierRow {
  const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as SupplierRow | undefined
  if (!row) {
    throw new Error('Supplier not found')
  }
  return row
}

function assertNotSystemSupplier(row: SupplierRow, action: string): void {
  if (row.is_system) {
    throw new HttpError(400, `Cannot ${action} the system Stock addition supplier`)
  }
}

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const term = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const rows = term
      ? (db
          .prepare(
            `SELECT * FROM suppliers
             WHERE name LIKE ? OR phone LIKE ?
             ORDER BY created_at DESC`,
          )
          .all(`%${term}%`, `%${term}%`) as SupplierRow[])
      : (db.prepare('SELECT * FROM suppliers ORDER BY created_at DESC').all() as SupplierRow[])
    res.json(rows.map(mapSupplier))
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    res.json(mapSupplier(getSupplierRow(getDatabase(), id)))
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(supplierInputSchema, req.body) as SupplierInput
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO suppliers (name, phone, address, notes, gstin, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(input.name, input.phone, input.address, input.notes, input.gstin ?? '')
    const row = getSupplierRow(db, Number(result.lastInsertRowid))
    res.status(201).json(mapSupplier(row))
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(supplierInputSchema, req.body) as SupplierInput
    const db = getDatabase()
    const existing = getSupplierRow(db, id)
    if (existing.is_system && input.name.trim() !== existing.name) {
      throw new HttpError(400, 'Cannot rename the system Stock addition supplier')
    }
    db.prepare(
      `UPDATE suppliers SET name = ?, phone = ?, address = ?, notes = ?, gstin = ? WHERE id = ?`,
    ).run(input.name, input.phone, input.address, input.notes, input.gstin ?? '', id)
    res.json(mapSupplier(getSupplierRow(db, id)))
  }),
)

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const existing = getSupplierRow(db, id)
    assertNotSystemSupplier(existing, 'delete')
    const inward = db.prepare('SELECT id FROM inwards WHERE supplier_id = ? LIMIT 1').get(id)
    if (inward) {
      throw new Error('Cannot delete supplier with existing inwards')
    }
    const result = db.prepare('DELETE FROM suppliers WHERE id = ?').run(id)
    if (result.changes === 0) {
      throw new Error('Supplier not found')
    }
    res.status(204).end()
  }),
)

export default router
