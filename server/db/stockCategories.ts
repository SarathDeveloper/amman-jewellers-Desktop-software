import type Database from 'better-sqlite3'
import { DEFAULT_STOCK_ITEM_NAMES } from '@shared/itemTypes'
import type { StockCategory } from '@shared/types'

export type CategoryRow = {
  id: number
  name: string
  sort_order: number
}

export function listCategoryRows(database: Database.Database): CategoryRow[] {
  return database
    .prepare('SELECT id, name, sort_order FROM stock_categories ORDER BY sort_order, name')
    .all() as CategoryRow[]
}

export function listCategoryNames(database: Database.Database): string[] {
  return listCategoryRows(database).map((row) => row.name)
}

export function findCategoryByName(database: Database.Database, name: string): CategoryRow | undefined {
  return database
    .prepare('SELECT id, name, sort_order FROM stock_categories WHERE lower(name) = lower(?)')
    .get(name) as CategoryRow | undefined
}

export function requireCategory(database: Database.Database, name: string): CategoryRow {
  const category = findCategoryByName(database, name)
  if (!category) {
    throw new Error('Category not found')
  }
  return category
}

export function mapCategory(row: CategoryRow): StockCategory {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
  }
}

export function assertCategoryExists(database: Database.Database, name: string): CategoryRow {
  const category = findCategoryByName(database, name)
  if (!category) {
    throw new Error('Category does not exist. Create it in Stock first.')
  }
  return category
}

export function ensureStockCategories(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS stock_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const existing = database
    .prepare('SELECT COUNT(*) AS count FROM stock_categories')
    .get() as { count: number }

  if (existing.count === 0) {
    const insert = database.prepare(
      'INSERT OR IGNORE INTO stock_categories (name, sort_order) VALUES (?, ?)',
    )
    const seed = database.transaction(() => {
      DEFAULT_STOCK_ITEM_NAMES.forEach((name, index) => {
        insert.run(name, index + 1)
      })
    })
    seed()
  }

  const missing = database
    .prepare(
      `SELECT DISTINCT item_name AS name
       FROM item_stock_days
       WHERE NOT EXISTS (
         SELECT 1 FROM stock_categories
         WHERE lower(name) = lower(item_stock_days.item_name)
       )`,
    )
    .all() as { name: string }[]

  if (missing.length === 0) {
    return
  }

  let maxOrder = (
    database.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM stock_categories').get() as {
      max_order: number
    }
  ).max_order
  const insert = database.prepare(
    'INSERT OR IGNORE INTO stock_categories (name, sort_order) VALUES (?, ?)',
  )
  const backfill = database.transaction(() => {
    for (const row of missing) {
      maxOrder += 1
      insert.run(row.name, maxOrder)
    }
  })
  backfill()
}
