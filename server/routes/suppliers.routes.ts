import { Router } from 'express'
import { supplierInputSchema } from '@shared/schemas'
import type { Supplier, SupplierInput } from '@shared/types'
import { getDatabase } from '../db'
import { asyncHandler, parseBody, parseIdParam } from '../lib/http'

const router = Router()

type SupplierRow = {
  id: number
  name: string
  phone: string
  address: string
  notes: string
  gstin: string
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
    createdAt: row.created_at,
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
    const row = getDatabase().prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as
      | SupplierRow
      | undefined
    if (!row) {
      throw new Error('Supplier not found')
    }
    res.json(mapSupplier(row))
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
    const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid) as SupplierRow
    res.status(201).json(mapSupplier(row))
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(supplierInputSchema, req.body) as SupplierInput
    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(id)
    if (!existing) {
      throw new Error('Supplier not found')
    }
    db.prepare(
      `UPDATE suppliers SET name = ?, phone = ?, address = ?, notes = ?, gstin = ? WHERE id = ?`,
    ).run(input.name, input.phone, input.address, input.notes, input.gstin ?? '', id)
    const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as SupplierRow
    res.json(mapSupplier(row))
  }),
)

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(id)
    if (!existing) {
      throw new Error('Supplier not found')
    }
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
