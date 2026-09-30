import { describe, expect, it } from 'vitest'
import { getDatabase } from '../../server/db'
import { getMigrations } from '../../server/db/migrations'
import { stripEpochNameSuffix } from '../../shared/customerName'
import { dbVersions, useIntegrationEnv } from './helpers/testEnv'

describe('database migrations', () => {
  useIntegrationEnv()

  it('applies all migrations on a fresh database', () => {
    expect(dbVersions()).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    ])
  })

  it('strips trailing Date.now suffixes from customer names', () => {
    const db = getDatabase()
    const dirty = 'Sundari 1790742540382'
    const ogpDirty = 'Buyer OGP 1790742543407'
    expect(stripEpochNameSuffix(dirty)).toBe('Sundari')

    const customer = db
      .prepare(
        `INSERT INTO customers (name, phone, address, notes, created_at)
         VALUES (?, '9876500001', 'Salem', '', datetime('now'))`,
      )
      .run(dirty)
    db.prepare(
      `INSERT INTO old_gold_purchases (
         purchase_no, purchase_date, customer_id, customer_name, customer_phone,
         total_amount, notes, status
       ) VALUES ('OGP-2026-9999', '2026-09-30', ?, ?, '', 0, '', 'draft')`,
    ).run(customer.lastInsertRowid, ogpDirty)

    const sql = getMigrations().find((migration) => migration.version === 40)?.sql
    expect(sql).toBeTruthy()
    db.exec(sql!)

    const customerRow = db
      .prepare('SELECT name FROM customers WHERE id = ?')
      .get(customer.lastInsertRowid) as { name: string }
    const purchaseRow = db
      .prepare('SELECT customer_name FROM old_gold_purchases WHERE purchase_no = ?')
      .get('OGP-2026-9999') as { customer_name: string }

    expect(customerRow.name).toBe('Sundari')
    expect(purchaseRow.customer_name).toBe('Buyer OGP')
  })
})
