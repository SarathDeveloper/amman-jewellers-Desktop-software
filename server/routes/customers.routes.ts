import { Router } from 'express'
import { customerInputSchema } from '@shared/schemas'
import type { Customer, CustomerInput } from '@shared/types'
import { getDatabase } from '../db'
import { asyncHandler, parseBody, parseIdParam } from '../lib/http'

const router = Router()

type CustomerRow = {
  id: number
  name: string
  phone: string
  address: string
  guardian_name: string
  notes: string
  gstin: string
  aadhaar: string
  pan: string
  created_at: string
}

function mapCustomer(row: CustomerRow & { last_bill_date?: string | null }): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    guardianName: row.guardian_name ?? '',
    notes: row.notes,
    gstin: row.gstin ?? '',
    aadhaar: row.aadhaar ?? '',
    pan: row.pan ?? '',
    createdAt: row.created_at,
    lastBillDate: row.last_bill_date ?? null,
  }
}

export function assertCustomerAllowedForBill(
  db: ReturnType<typeof getDatabase>,
  customerId: number,
): void {
  const row = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId) as
    | { id: number }
    | undefined
  if (!row) {
    throw new Error('Customer not found')
  }
}

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const term = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const lastBill = `(SELECT MAX(invoice_date) FROM invoices
       WHERE customer_id = customers.id AND status = 'final' AND is_estimate = 0) AS last_bill_date`
    const rows = term
      ? (db
          .prepare(
            `SELECT *, ${lastBill} FROM customers
             WHERE name LIKE ? OR phone LIKE ?
             ORDER BY created_at DESC`,
          )
          .all(`%${term}%`, `%${term}%`) as Array<CustomerRow & { last_bill_date: string | null }>)
      : (db
          .prepare(`SELECT *, ${lastBill} FROM customers ORDER BY created_at DESC`)
          .all() as Array<CustomerRow & { last_bill_date: string | null }>)
    res.json(rows.map(mapCustomer))
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const row = getDatabase().prepare('SELECT * FROM customers WHERE id = ?').get(id) as
      | CustomerRow
      | undefined
    if (!row) {
      throw new Error('Customer not found')
    }
    res.json(mapCustomer(row))
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(customerInputSchema, req.body) as CustomerInput
    const db = getDatabase()
    const result = db
      .prepare(
        `INSERT INTO customers (name, phone, address, guardian_name, notes, gstin, aadhaar, pan, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        input.name,
        input.phone,
        input.address,
        input.guardianName ?? '',
        input.notes ?? '',
        input.gstin ?? '',
        input.aadhaar ?? '',
        input.pan ?? '',
      )
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid) as CustomerRow
    res.status(201).json(mapCustomer(row))
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(customerInputSchema, req.body) as CustomerInput
    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id) as
      | { id: number }
      | undefined
    if (!existing) {
      throw new Error('Customer not found')
    }
    db.prepare(
      `UPDATE customers SET name = ?, phone = ?, address = ?, guardian_name = ?, notes = ?, gstin = ?, aadhaar = ?, pan = ? WHERE id = ?`,
    ).run(
      input.name,
      input.phone,
      input.address,
      input.guardianName ?? '',
      input.notes ?? '',
      input.gstin ?? '',
      input.aadhaar ?? '',
      input.pan ?? '',
      id,
    )
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow
    res.json(mapCustomer(row))
  }),
)

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id) as
      | { id: number }
      | undefined
    if (!existing) {
      throw new Error('Customer not found')
    }
    const invoice = db.prepare('SELECT id FROM invoices WHERE customer_id = ? LIMIT 1').get(id)
    if (invoice) {
      throw new Error('Cannot delete customer with existing invoices')
    }
    const dueEntry = db.prepare('SELECT id FROM customer_dues WHERE customer_id = ? LIMIT 1').get(id)
    if (dueEntry) {
      throw new Error('Cannot delete customer with existing dues entries')
    }
    const pledge = db.prepare('SELECT id FROM pledges WHERE customer_id = ? LIMIT 1').get(id)
    if (pledge) {
      throw new Error('Cannot delete customer with existing pledges')
    }
    const schemeAccount = db
      .prepare('SELECT id FROM gold_saving_accounts WHERE customer_id = ? LIMIT 1')
      .get(id)
    if (schemeAccount) {
      throw new Error('Cannot delete customer with existing gold savings accounts')
    }
    const result = db.prepare('DELETE FROM customers WHERE id = ?').run(id)
    if (result.changes === 0) {
      throw new Error('Customer not found')
    }
    res.status(204).end()
  }),
)

export default router
