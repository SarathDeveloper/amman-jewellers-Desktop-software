import { roundMoney } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import { reportQuerySchema } from '@shared/schemas'
import {
  findReport,
  type ReportColumn,
  type ReportDefinition,
  type ReportId,
  type ReportResult,
} from '@shared/reportsCatalog'
import type { ItemStockRow } from '@shared/types'
import type { z } from 'zod'
import { getDatabase } from '../db'
import { HttpError } from '../lib/http'
import { listRowsForMetal } from '../routes/stock.routes'

type SqlRow = Record<string, unknown>

interface Scope {
  from: string
  to: string
  customerId?: number
  supplierId?: number
  productId?: number
  metal?: string
  qtyCutoff: number
}

const PAYABLE = 'CASE WHEN i.amount_payable IS NULL THEN i.total ELSE i.amount_payable END'
const FINAL_SALE = `i.status = 'final' AND i.is_estimate = 0`
const GST_SALE = `${FINAL_SALE} AND (i.is_historical = 0 OR i.bill_format = 'tax_invoice')`

const billColumns: ReportColumn[] = [
  { key: 'date', label: 'Date', format: 'date' },
  { key: 'invoiceNo', label: 'Invoice' },
  { key: 'customer', label: 'Customer' },
  { key: 'payment', label: 'Payment' },
  { key: 'payable', label: 'Payable', align: 'right', format: 'money', total: true },
  { key: 'paid', label: 'Paid', align: 'right', format: 'money', total: true },
  { key: 'balance', label: 'Balance', align: 'right', format: 'money', total: true },
]

const collectionColumns: ReportColumn[] = [
  { key: 'date', label: 'Date', format: 'date' },
  { key: 'customer', label: 'Customer' },
  { key: 'document', label: 'Document' },
  { key: 'mode', label: 'Mode' },
  { key: 'amount', label: 'Amount', align: 'right', format: 'money', total: true },
  { key: 'note', label: 'Note' },
]

function num(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: unknown): number {
  return roundMoney(num(value))
}

function weight(value: unknown): number {
  return Math.round(num(value) * 1000) / 1000
}

function text(value: unknown): string {
  return value == null ? '' : String(value)
}

function rowsOf(db: ReturnType<typeof getDatabase>, sql: string, params: unknown[]): SqlRow[] {
  return db.prepare(sql).all(...params) as SqlRow[]
}

function oneOf(db: ReturnType<typeof getDatabase>, sql: string, params: unknown[]): SqlRow {
  return (db.prepare(sql).get(...params) as SqlRow | undefined) ?? {}
}

function result(columns: ReportColumn[], rows: Record<string, string | number>[]): ReportResult {
  const totals: Record<string, number> = {}
  for (const column of columns) {
    if (!column.total) continue
    totals[column.key] = roundMoney(rows.reduce((sum, row) => sum + num(row[column.key]), 0))
  }
  return { columns, rows, totals }
}

export function resolveScope(report: ReportDefinition, query: z.infer<typeof reportQuerySchema>): Scope {
  const today = localTodayIso()
  let from = query.from
  let to = query.to
  if (report.dateScope === 'none') {
    from = '0001-01-01'
    to = '9999-12-31'
  } else if (report.dateScope === 'asOf') {
    const day = query.to ?? query.from ?? today
    from = day
    to = day
  } else {
    from = from ?? (report.defaultToday ? today : `${today.slice(0, 7)}-01`)
    to = to ?? today
  }
  if (from > to) {
    throw new HttpError(400, 'From date must be on or before the to date')
  }
  const metal = query.metal?.trim()
  return {
    from,
    to,
    customerId: query.customerId,
    supplierId: query.supplierId,
    productId: query.productId,
    metal: metal ? metal : undefined,
    qtyCutoff: query.qtyCutoff ?? 1,
  }
}

function saleWhere(
  scope: Scope,
  extra: { sql: string; value?: unknown }[] = [],
): { where: string; params: unknown[] } {
  const clauses = [FINAL_SALE, 'i.invoice_date >= ?', 'i.invoice_date <= ?']
  const params: unknown[] = [scope.from, scope.to]
  for (const item of extra) {
    clauses.push(item.sql)
    if (item.value !== undefined) params.push(item.value)
  }
  if (scope.customerId) {
    clauses.push('i.customer_id = ?')
    params.push(scope.customerId)
  }
  return { where: clauses.join(' AND '), params }
}

function inwardWhere(scope: Scope): { where: string; params: unknown[] } {
  const clauses = [`w.status = 'final'`, 'w.inward_date >= ?', 'w.inward_date <= ?']
  const params: unknown[] = [scope.from, scope.to]
  if (scope.supplierId) {
    clauses.push('w.supplier_id = ?')
    params.push(scope.supplierId)
  }
  return { where: clauses.join(' AND '), params }
}

function metalClause(column: string, scope: Scope, params: unknown[]): string {
  if (!scope.metal) return ''
  params.push(scope.metal)
  return ` AND lower(trim(${column})) = lower(trim(?))`
}

function productClause(column: string, scope: Scope, params: unknown[]): string {
  if (!scope.productId) return ''
  params.push(scope.productId)
  return ` AND ${column} = ?`
}

function customerClause(column: string, scope: Scope, params: unknown[]): string {
  if (!scope.customerId) return ''
  params.push(scope.customerId)
  return ` AND ${column} = ?`
}

function paymentLabel(column: string): string {
  return `CASE ${column}
    WHEN 'upi' THEN 'UPI'
    WHEN 'card' THEN 'Card'
    WHEN 'mixed' THEN 'Mixed'
    WHEN 'tax_invoice' THEN 'Tax invoice'
    WHEN 'cash_bill' THEN 'Cash bill'
    ELSE 'Cash'
  END`
}

function billRows(db: ReturnType<typeof getDatabase>, scope: Scope, format?: 'cash_bill' | 'tax_invoice') {
  const extra = format ? [{ sql: 'i.bill_format = ?', value: format }] : []
  const { where, params } = saleWhere(scope, extra)
  const rows = rowsOf(
    db,
    `SELECT i.invoice_date AS date, i.invoice_no AS invoice_no, c.name AS customer,
            ${paymentLabel('i.payment_mode')} AS payment,
            ${PAYABLE} AS payable, i.amount_paid AS paid, i.balance_due AS balance
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE ${where}
     ORDER BY i.invoice_date, i.id`,
    params,
  )
  return result(
    billColumns,
    rows.map((row) => ({
      date: text(row.date),
      invoiceNo: text(row.invoice_no),
      customer: text(row.customer),
      payment: text(row.payment),
      payable: money(row.payable),
      paid: money(row.paid),
      balance: money(row.balance),
    })),
  )
}

function collectionSql(scope: Scope, mode?: string): { sql: string; params: unknown[] } {
  const params: unknown[] = [scope.from, scope.to, scope.from, scope.to]
  let customer = ''
  if (scope.customerId) {
    customer = ' AND customer_id = ?'
    params.push(scope.customerId)
  }
  let modeClause = ''
  if (mode) {
    modeClause = ' AND mode = ?'
    params.push(mode)
  }
  const sql = `SELECT entry_date, customer_name, document_no, mode, amount, note
    FROM (
      SELECT d.entry_date AS entry_date,
             c.name AS customer_name,
             COALESCE(i.invoice_no, p.receipt_no, '') AS document_no,
             CASE
               WHEN instr(lower(d.note), 'upi') > 0 THEN 'UPI'
               WHEN instr(lower(d.note), 'card') > 0 THEN 'Card'
               WHEN instr(lower(d.note), 'mixed') > 0 THEN 'Mixed'
               WHEN instr(lower(d.note), 'cash') > 0 THEN 'Cash'
               ELSE 'Cash'
             END AS mode,
             d.amount AS amount,
             d.note AS note,
             d.customer_id AS customer_id
      FROM customer_dues d
      JOIN customers c ON c.id = d.customer_id
      LEFT JOIN invoices i ON i.id = d.invoice_id
      LEFT JOIN pledges p ON p.id = d.pledge_id
      WHERE d.kind = 'payment'
        AND d.entry_date >= ? AND d.entry_date <= ?
      UNION ALL
      SELECT i.invoice_date,
             c.name,
             i.invoice_no,
             ${paymentLabel('i.payment_mode')},
             i.amount_paid,
             '',
             i.customer_id
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE ${FINAL_SALE}
        AND i.amount_paid > 0
        AND i.invoice_date >= ? AND i.invoice_date <= ?
        AND NOT EXISTS (
          SELECT 1 FROM customer_dues d
          WHERE d.invoice_id = i.id AND d.kind = 'payment'
        )
    ) payments
    WHERE 1 = 1${customer}${modeClause}`
  return { sql, params }
}

function movementWhere(scope: Scope, type?: string): { where: string; params: unknown[] } {
  const clauses = ['m.movement_date >= ?', 'm.movement_date <= ?']
  const params: unknown[] = [scope.from, scope.to]
  if (type) {
    clauses.push('m.movement_type = ?')
    params.push(type)
  }
  let where = clauses.join(' AND ')
  where += metalClause('m.metal', scope, params)
  where += productClause('m.product_id', scope, params)
  return { where, params }
}

function movementRows(db: ReturnType<typeof getDatabase>, scope: Scope, type?: string) {
  const { where, params } = movementWhere(scope, type)
  const rows = rowsOf(
    db,
    `SELECT m.movement_date AS date, m.movement_type AS movement_type, m.metal, m.category,
            COALESCE(p.name, '') AS product, m.qty_delta AS qty, m.weight_delta AS weight, m.reason
     FROM stock_movements m
     LEFT JOIN products p ON p.id = m.product_id
     WHERE ${where}
     ORDER BY m.movement_date, m.id`,
    params,
  )
  return result(
    [
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'type', label: 'Type' },
      { key: 'metal', label: 'Metal' },
      { key: 'category', label: 'Category' },
      { key: 'product', label: 'Product' },
      { key: 'qty', label: 'Qty', align: 'right', format: 'qty', total: true },
      { key: 'weight', label: 'Weight (g)', align: 'right', format: 'weight', total: true },
      { key: 'reason', label: 'Reason' },
    ],
    rows.map((row) => ({
      date: text(row.date).slice(0, 10),
      type: text(row.movement_type).replace(/_/g, ' '),
      metal: text(row.metal),
      category: text(row.category),
      product: text(row.product),
      qty: num(row.qty),
      weight: weight(row.weight),
      reason: text(row.reason),
    })),
  )
}

function productStockWhere(scope: Scope, metal?: string): { where: string; params: unknown[] } {
  const clauses = ['1 = 1']
  const params: unknown[] = []
  const metalScope = metal ? { ...scope, metal } : scope
  let where = clauses.join(' AND ')
  where += metalClause('p.metal', metalScope, params)
  where += productClause('p.id', scope, params)
  return { where, params }
}

function productLines(db: ReturnType<typeof getDatabase>, scope: Scope, metal?: string) {
  const { where, params } = productStockWhere(scope, metal)
  const rows = rowsOf(
    db,
    `SELECT p.name AS product, p.metal, p.category, p.purity, p.stock_qty AS qty,
            p.net_weight AS net_weight, p.stock_qty * p.net_weight AS stock_weight
     FROM products p
     WHERE ${where}
     ORDER BY p.metal, p.category, p.name`,
    params,
  )
  return result(
    [
      { key: 'product', label: 'Product' },
      { key: 'metal', label: 'Metal' },
      { key: 'category', label: 'Category' },
      { key: 'purity', label: 'Purity' },
      { key: 'qty', label: 'Qty', align: 'right', format: 'qty', total: true },
      { key: 'netWeight', label: 'Net (g)', align: 'right', format: 'weight' },
      { key: 'stockWeight', label: 'Stock (g)', align: 'right', format: 'weight', total: true },
    ],
    rows.map((row) => ({
      product: text(row.product),
      metal: text(row.metal),
      category: text(row.category),
      purity: text(row.purity),
      qty: num(row.qty),
      netWeight: weight(row.net_weight),
      stockWeight: weight(row.stock_weight),
    })),
  )
}

function metalSummary(metal: 'Gold' | 'Silver', scope: Scope): ReportResult {
  const rows = listRowsForMetal(scope.to, metal)
  return result(
    [
      { key: 'category', label: 'Category' },
      { key: 'opening', label: 'Opening (g)', align: 'right', format: 'weight', total: true },
      { key: 'inward', label: 'Inward (g)', align: 'right', format: 'weight', total: true },
      { key: 'sales', label: 'Sales (g)', align: 'right', format: 'weight', total: true },
      { key: 'closing', label: 'Closing (g)', align: 'right', format: 'weight', total: true },
    ],
    rows.map((row: ItemStockRow) => ({
      category: row.itemName,
      opening: weight(row.openingWeight),
      inward: weight(row.autoPurchaseIn),
      sales: weight(row.effectiveSales),
      closing: weight(row.closingWeight),
    })),
  )
}

function gstWhere(scope: Scope): { where: string; params: unknown[] } {
  const clauses = [GST_SALE, 'i.invoice_date >= ?', 'i.invoice_date <= ?']
  const params: unknown[] = [scope.from, scope.to]
  if (scope.customerId) {
    clauses.push('i.customer_id = ?')
    params.push(scope.customerId)
  }
  return { where: clauses.join(' AND '), params }
}

function pledgeCustomer(scope: Scope, params: unknown[], column = 'p.customer_id'): string {
  return customerClause(column, scope, params)
}

const runners: Record<ReportId, (db: ReturnType<typeof getDatabase>, scope: Scope) => ReportResult> = {
  'daily-sales': (db, scope) => {
    const { where, params } = saleWhere(scope)
    const rows = rowsOf(
      db,
      `SELECT i.invoice_date AS date, COUNT(*) AS bills,
              SUM(${PAYABLE}) AS payable, SUM(i.amount_paid) AS paid, SUM(i.balance_due) AS balance
       FROM invoices i
       WHERE ${where}
       GROUP BY i.invoice_date
       ORDER BY i.invoice_date`,
      params,
    )
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'bills', label: 'Bills', align: 'right', format: 'qty', total: true },
        { key: 'payable', label: 'Payable', align: 'right', format: 'money', total: true },
        { key: 'paid', label: 'Paid', align: 'right', format: 'money', total: true },
        { key: 'balance', label: 'Balance', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        date: text(row.date),
        bills: num(row.bills),
        payable: money(row.payable),
        paid: money(row.paid),
        balance: money(row.balance),
      })),
    )
  },
  'date-wise-sales': (db, scope) => billRows(db, scope),
  'cash-sales': (db, scope) => billRows(db, scope, 'cash_bill'),
  'tax-invoice-sales': (db, scope) => billRows(db, scope, 'tax_invoice'),
  'adagu-sales': () => {
    throw new HttpError(400, 'Adagu receipts are pledges, not sales. Use Adagu / Pledge reports.')
  },
  'product-wise-sales': (db, scope) => {
    const { where, params } = saleWhere(scope, [{ sql: `ii.line_kind = 'sale'` }])
    let filter = ''
    filter += metalClause('ii.metal', scope, params)
    filter += productClause('ii.product_id', scope, params)
    const rows = rowsOf(
      db,
      `SELECT COALESCE(NULLIF(TRIM(ii.description), ''), pr.name, NULLIF(TRIM(ii.category), ''), 'Item') AS product,
              ii.metal AS metal,
              SUM(ii.qty) AS qty,
              SUM(ii.net_weight * ii.qty) AS weight,
              SUM(ii.line_total) AS amount
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       LEFT JOIN products pr ON pr.id = ii.product_id
       WHERE ${where}${filter}
       GROUP BY product, ii.metal
       ORDER BY amount DESC, product`,
      params,
    )
    return result(
      [
        { key: 'product', label: 'Product' },
        { key: 'metal', label: 'Metal' },
        { key: 'qty', label: 'Qty', align: 'right', format: 'qty', total: true },
        { key: 'weight', label: 'Weight (g)', align: 'right', format: 'weight', total: true },
        { key: 'amount', label: 'Amount', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        product: text(row.product),
        metal: text(row.metal),
        qty: num(row.qty),
        weight: weight(row.weight),
        amount: money(row.amount),
      })),
    )
  },
  'customer-wise-sales': (db, scope) => {
    const { where, params } = saleWhere(scope)
    const rows = rowsOf(
      db,
      `SELECT c.name AS customer, c.phone AS phone, COUNT(*) AS bills,
              SUM(${PAYABLE}) AS payable, SUM(i.amount_paid) AS paid, SUM(i.balance_due) AS balance
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE ${where}
       GROUP BY i.customer_id
       ORDER BY payable DESC, c.name`,
      params,
    )
    return result(
      [
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'bills', label: 'Bills', align: 'right', format: 'qty', total: true },
        { key: 'payable', label: 'Payable', align: 'right', format: 'money', total: true },
        { key: 'paid', label: 'Paid', align: 'right', format: 'money', total: true },
        { key: 'balance', label: 'Balance', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        customer: text(row.customer),
        phone: text(row.phone),
        bills: num(row.bills),
        payable: money(row.payable),
        paid: money(row.paid),
        balance: money(row.balance),
      })),
    )
  },
  'sales-return': () => {
    throw new HttpError(400, 'There is no sales return document yet.')
  },
  'purchase-register': (db, scope) => {
    const { where, params } = inwardWhere(scope)
    const rows = rowsOf(
      db,
      `SELECT w.inward_date AS date, w.inward_no AS inward_no, s.name AS supplier, w.total AS total
       FROM inwards w
       JOIN suppliers s ON s.id = w.supplier_id
       WHERE ${where}
       ORDER BY w.inward_date, w.id`,
      params,
    )
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'inwardNo', label: 'Inward' },
        { key: 'supplier', label: 'Supplier' },
        { key: 'total', label: 'Total', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        date: text(row.date),
        inwardNo: text(row.inward_no),
        supplier: text(row.supplier),
        total: money(row.total),
      })),
    )
  },
  'date-wise-purchases': (db, scope) => {
    const { where, params } = inwardWhere(scope)
    const rows = rowsOf(
      db,
      `SELECT w.inward_date AS date, COUNT(*) AS inwards, SUM(w.total) AS total
       FROM inwards w
       WHERE ${where}
       GROUP BY w.inward_date
       ORDER BY w.inward_date`,
      params,
    )
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'inwards', label: 'Inwards', align: 'right', format: 'qty', total: true },
        { key: 'total', label: 'Total', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        date: text(row.date),
        inwards: num(row.inwards),
        total: money(row.total),
      })),
    )
  },
  'supplier-wise-purchases': (db, scope) => {
    const { where, params } = inwardWhere(scope)
    const rows = rowsOf(
      db,
      `SELECT s.name AS supplier, COUNT(*) AS inwards, SUM(w.total) AS total
       FROM inwards w
       JOIN suppliers s ON s.id = w.supplier_id
       WHERE ${where}
       GROUP BY w.supplier_id
       ORDER BY total DESC, s.name`,
      params,
    )
    return result(
      [
        { key: 'supplier', label: 'Supplier' },
        { key: 'inwards', label: 'Inwards', align: 'right', format: 'qty', total: true },
        { key: 'total', label: 'Total', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        supplier: text(row.supplier),
        inwards: num(row.inwards),
        total: money(row.total),
      })),
    )
  },
  'product-wise-purchases': (db, scope) => {
    const { where, params } = inwardWhere(scope)
    let filter = ''
    filter += metalClause('ii.metal', scope, params)
    filter += productClause('ii.product_id', scope, params)
    const rows = rowsOf(
      db,
      `SELECT COALESCE(pr.name, NULLIF(TRIM(ii.category), ''), 'Raw metal') AS product,
              ii.metal AS metal,
              SUM(ii.qty) AS qty,
              SUM(ii.net_weight * ii.qty) AS weight,
              SUM(ii.line_total) AS amount
       FROM inward_items ii
       JOIN inwards w ON w.id = ii.inward_id
       LEFT JOIN products pr ON pr.id = ii.product_id
       WHERE ${where}${filter}
       GROUP BY product, ii.metal
       ORDER BY amount DESC, product`,
      params,
    )
    return result(
      [
        { key: 'product', label: 'Product' },
        { key: 'metal', label: 'Metal' },
        { key: 'qty', label: 'Qty', align: 'right', format: 'qty', total: true },
        { key: 'weight', label: 'Weight (g)', align: 'right', format: 'weight', total: true },
        { key: 'amount', label: 'Amount', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        product: text(row.product),
        metal: text(row.metal),
        qty: num(row.qty),
        weight: weight(row.weight),
        amount: money(row.amount),
      })),
    )
  },
  'purchase-return': () => {
    throw new HttpError(400, 'There is no purchase return document yet.')
  },
  'current-stock': (db, scope) => productLines(db, scope),
  'gold-stock': (db, scope) => productLines(db, scope, 'Gold'),
  'silver-stock': (db, scope) => productLines(db, scope, 'Silver'),
  'product-stock': (db, scope) => {
    const params: unknown[] = []
    const metal = metalClause('p.metal', scope, params)
    const rows = rowsOf(
      db,
      `SELECT p.category AS category, p.metal AS metal, COUNT(*) AS products,
              SUM(p.stock_qty) AS qty, SUM(p.stock_qty * p.net_weight) AS weight
       FROM products p
       WHERE 1 = 1${metal}
       GROUP BY p.category, p.metal
       ORDER BY p.metal, p.category`,
      params,
    )
    return result(
      [
        { key: 'category', label: 'Category' },
        { key: 'metal', label: 'Metal' },
        { key: 'products', label: 'Products', align: 'right', format: 'qty', total: true },
        { key: 'qty', label: 'Qty', align: 'right', format: 'qty', total: true },
        { key: 'weight', label: 'Weight (g)', align: 'right', format: 'weight', total: true },
      ],
      rows.map((row) => ({
        category: text(row.category) || 'Uncategorised',
        metal: text(row.metal),
        products: num(row.products),
        qty: num(row.qty),
        weight: weight(row.weight),
      })),
    )
  },
  'variant-size-stock': () => {
    throw new HttpError(400, 'Products do not have a size or variant.')
  },
  'stock-movement': (db, scope) => movementRows(db, scope),
  'stock-inward': (db, scope) => movementRows(db, scope, 'purchase'),
  'stock-outward': (db, scope) => movementRows(db, scope, 'sale'),
  'low-stock': (db, scope) => {
    const params: unknown[] = [scope.qtyCutoff]
    const metal = metalClause('p.metal', scope, params)
    const rows = rowsOf(
      db,
      `SELECT p.name AS product, p.metal, p.category, p.stock_qty AS qty
       FROM products p
       WHERE p.stock_qty <= ?${metal}
       ORDER BY p.stock_qty, p.name`,
      params,
    )
    return result(
      [
        { key: 'product', label: 'Product' },
        { key: 'metal', label: 'Metal' },
        { key: 'category', label: 'Category' },
        { key: 'qty', label: 'Qty', align: 'right', format: 'qty' },
      ],
      rows.map((row) => ({
        product: text(row.product),
        metal: text(row.metal),
        category: text(row.category),
        qty: num(row.qty),
      })),
    )
  },
  'customer-list': (db) => {
    const rows = rowsOf(
      db,
      `SELECT name, phone, address, gstin
       FROM customers
       ORDER BY name`,
      [],
    )
    return result(
      [
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'address', label: 'Address' },
        { key: 'gstin', label: 'GSTIN' },
      ],
      rows.map((row) => ({
        customer: text(row.name),
        phone: text(row.phone),
        address: text(row.address),
        gstin: text(row.gstin),
      })),
    )
  },
  'customer-transactions': (db, scope) => {
    const params: unknown[] = []
    const saleCustomer = customerClause('i.customer_id', scope, params)
    params.push(scope.from, scope.to)
    const pledgeParams: unknown[] = []
    const pledgeCustomerClause = customerClause('p.customer_id', scope, pledgeParams)
    pledgeParams.push(scope.from, scope.to)
    const dueParams: unknown[] = []
    const dueCustomer = customerClause('d.customer_id', scope, dueParams)
    dueParams.push(scope.from, scope.to)
    const rows = rowsOf(
      db,
      `SELECT * FROM (
         SELECT i.invoice_date AS date, 'Sale' AS kind, i.invoice_no AS reference,
                c.name AS customer, ${PAYABLE} AS amount, ${paymentLabel('i.bill_format')} AS note
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id
         WHERE ${FINAL_SALE}${saleCustomer}
           AND i.invoice_date >= ? AND i.invoice_date <= ?
         UNION ALL
         SELECT p.pledge_date, 'Pledge', p.receipt_no, c.name, p.loan_amount, p.status
         FROM pledges p
         JOIN customers c ON c.id = p.customer_id
         WHERE p.status != 'draft'${pledgeCustomerClause}
           AND p.pledge_date >= ? AND p.pledge_date <= ?
         UNION ALL
         SELECT d.entry_date,
                CASE d.kind WHEN 'due' THEN 'Due' ELSE 'Payment' END,
                COALESCE(i.invoice_no, pl.receipt_no, ''),
                c.name,
                d.amount,
                d.note
         FROM customer_dues d
         JOIN customers c ON c.id = d.customer_id
         LEFT JOIN invoices i ON i.id = d.invoice_id
         LEFT JOIN pledges pl ON pl.id = d.pledge_id
         WHERE 1 = 1${dueCustomer}
           AND d.entry_date >= ? AND d.entry_date <= ?
       )
       ORDER BY date, kind`,
      [...params, ...pledgeParams, ...dueParams],
    )
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'kind', label: 'Kind' },
        { key: 'reference', label: 'Reference' },
        { key: 'customer', label: 'Customer' },
        { key: 'amount', label: 'Amount', align: 'right', format: 'money', total: true },
        { key: 'note', label: 'Note' },
      ],
      rows.map((row) => ({
        date: text(row.date).slice(0, 10),
        kind: text(row.kind),
        reference: text(row.reference),
        customer: text(row.customer),
        amount: money(row.amount),
        note: text(row.note),
      })),
    )
  },
  'customer-outstanding': (db, scope) => {
    const params: unknown[] = []
    const customer = customerClause('d.customer_id', scope, params)
    const rows = rowsOf(
      db,
      `SELECT c.name AS customer, c.phone AS phone,
              SUM(CASE WHEN d.kind = 'due' THEN d.amount ELSE -d.amount END) AS balance
       FROM customer_dues d
       JOIN customers c ON c.id = d.customer_id
       WHERE 1 = 1${customer}
       GROUP BY d.customer_id
       HAVING balance > 0.009
       ORDER BY balance DESC, c.name`,
      params,
    )
    return result(
      [
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'balance', label: 'Balance', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        customer: text(row.customer),
        phone: text(row.phone),
        balance: money(row.balance),
      })),
    )
  },
  'customer-purchase-history': (db, scope) => billRows(db, scope),
  'customer-metal-transactions': (db, scope) => {
    const saleParams: unknown[] = [scope.from, scope.to]
    let saleFilter = customerClause('i.customer_id', scope, saleParams)
    saleFilter += metalClause('ii.metal', scope, saleParams)
    const pledgeParams: unknown[] = [scope.from, scope.to]
    let pledgeFilter = pledgeCustomer(scope, pledgeParams)
    pledgeFilter += metalClause('pi.metal', scope, pledgeParams)
    const rows = rowsOf(
      db,
      `SELECT * FROM (
         SELECT c.name AS customer, ii.metal AS metal, 'Sale' AS source,
                SUM(ii.net_weight * ii.qty) AS weight, SUM(ii.line_total) AS amount
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         JOIN customers c ON c.id = i.customer_id
         WHERE ${FINAL_SALE} AND ii.line_kind = 'sale'
           AND i.invoice_date >= ? AND i.invoice_date <= ?${saleFilter}
         GROUP BY i.customer_id, ii.metal
         UNION ALL
         SELECT c.name, pi.metal, 'Pledge', SUM(pi.net_weight), 0
         FROM pledge_items pi
         JOIN pledges p ON p.id = pi.pledge_id
         JOIN customers c ON c.id = p.customer_id
         WHERE p.pledge_date >= ? AND p.pledge_date <= ?${pledgeFilter}
         GROUP BY p.customer_id, pi.metal
       )
       ORDER BY customer, metal, source`,
      [...saleParams, ...pledgeParams],
    )
    return result(
      [
        { key: 'customer', label: 'Customer' },
        { key: 'metal', label: 'Metal' },
        { key: 'source', label: 'Source' },
        { key: 'weight', label: 'Weight (g)', align: 'right', format: 'weight', total: true },
        { key: 'amount', label: 'Sale amount', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        customer: text(row.customer),
        metal: text(row.metal),
        source: text(row.source),
        weight: weight(row.weight),
        amount: money(row.amount),
      })),
    )
  },
  'daily-collection': (db, scope) => {
    const { sql, params } = collectionSql(scope)
    const rows = rowsOf(
      db,
      `SELECT entry_date AS date, COUNT(*) AS receipts, SUM(amount) AS amount,
              SUM(CASE WHEN mode = 'Cash' THEN amount ELSE 0 END) AS cash,
              SUM(CASE WHEN mode = 'UPI' THEN amount ELSE 0 END) AS upi,
              SUM(CASE WHEN mode = 'Card' THEN amount ELSE 0 END) AS card,
              SUM(CASE WHEN mode = 'Mixed' THEN amount ELSE 0 END) AS mixed
       FROM (${sql}) collections
       GROUP BY entry_date
       ORDER BY entry_date`,
      params,
    )
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'receipts', label: 'Receipts', align: 'right', format: 'qty', total: true },
        { key: 'amount', label: 'Amount', align: 'right', format: 'money', total: true },
        { key: 'cash', label: 'Cash', align: 'right', format: 'money', total: true },
        { key: 'upi', label: 'UPI', align: 'right', format: 'money', total: true },
        { key: 'card', label: 'Card', align: 'right', format: 'money', total: true },
        { key: 'mixed', label: 'Mixed', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        date: text(row.date).slice(0, 10),
        receipts: num(row.receipts),
        amount: money(row.amount),
        cash: money(row.cash),
        upi: money(row.upi),
        card: money(row.card),
        mixed: money(row.mixed),
      })),
    )
  },
  'cash-collection': (db, scope) => collectionDetail(db, scope, 'Cash'),
  'upi-collection': (db, scope) => collectionDetail(db, scope, 'UPI'),
  'card-collection': (db, scope) => collectionDetail(db, scope, 'Card'),
  'credit-outstanding': (db, scope) => {
    const params: unknown[] = []
    const customer = customerClause('i.customer_id', scope, params)
    const rows = rowsOf(
      db,
      `SELECT i.invoice_date AS date, i.invoice_no AS invoice_no, c.name AS customer,
              ${PAYABLE} AS payable, i.amount_paid AS paid, i.balance_due AS balance
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE ${FINAL_SALE} AND i.balance_due > 0.009${customer}
       ORDER BY i.invoice_date, i.id`,
      params,
    )
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'invoiceNo', label: 'Invoice' },
        { key: 'customer', label: 'Customer' },
        { key: 'payable', label: 'Payable', align: 'right', format: 'money', total: true },
        { key: 'paid', label: 'Paid', align: 'right', format: 'money', total: true },
        { key: 'balance', label: 'Balance', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        date: text(row.date),
        invoiceNo: text(row.invoice_no),
        customer: text(row.customer),
        payable: money(row.payable),
        paid: money(row.paid),
        balance: money(row.balance),
      })),
    )
  },
  'payment-history': (db, scope) => collectionDetail(db, scope),
  'gold-stock-summary': (_db, scope) => metalSummary('Gold', scope),
  'silver-stock-summary': (_db, scope) => metalSummary('Silver', scope),
  'purity-wise-stock': (db, scope) => {
    const params: unknown[] = []
    const metal = metalClause('p.metal', scope, params)
    const rows = rowsOf(
      db,
      `SELECT p.metal AS metal, p.purity AS purity, SUM(p.stock_qty) AS qty,
              SUM(p.stock_qty * p.net_weight) AS weight
       FROM products p
       WHERE 1 = 1${metal}
       GROUP BY p.metal, p.purity
       ORDER BY p.metal, p.purity`,
      params,
    )
    return result(
      [
        { key: 'metal', label: 'Metal' },
        { key: 'purity', label: 'Purity' },
        { key: 'qty', label: 'Qty', align: 'right', format: 'qty', total: true },
        { key: 'weight', label: 'Weight (g)', align: 'right', format: 'weight', total: true },
      ],
      rows.map((row) => ({
        metal: text(row.metal),
        purity: text(row.purity) || '—',
        qty: num(row.qty),
        weight: weight(row.weight),
      })),
    )
  },
  'metal-wise-inward': (db, scope) => metalMovement(db, scope, 'purchase', 'Inward (g)'),
  'metal-wise-outward': (db, scope) => metalMovement(db, scope, 'sale', 'Outward (g)'),
  'weight-movement': (db, scope) => {
    const params: unknown[] = [scope.from, scope.to]
    const metal = metalClause('metal', scope, params)
    const rows = rowsOf(
      db,
      `SELECT movement_date AS date, metal,
              SUM(CASE WHEN weight_delta > 0 THEN weight_delta ELSE 0 END) AS inward_g,
              SUM(CASE WHEN weight_delta < 0 THEN -weight_delta ELSE 0 END) AS outward_g,
              SUM(weight_delta) AS net_g
       FROM stock_movements
       WHERE movement_date >= ? AND movement_date <= ?${metal}
       GROUP BY movement_date, metal
       ORDER BY movement_date, metal`,
      params,
    )
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'metal', label: 'Metal' },
        { key: 'inward', label: 'Inward (g)', align: 'right', format: 'weight', total: true },
        { key: 'outward', label: 'Outward (g)', align: 'right', format: 'weight', total: true },
        { key: 'net', label: 'Net (g)', align: 'right', format: 'weight', total: true },
      ],
      rows.map((row) => ({
        date: text(row.date).slice(0, 10),
        metal: text(row.metal),
        inward: weight(row.inward_g),
        outward: weight(row.outward_g),
        net: weight(row.net_g),
      })),
    )
  },
  'active-pledges': (db, scope) => {
    const params: unknown[] = []
    const customer = pledgeCustomer(scope, params)
    return pledgeList(db, scope, `p.status = 'active'${customer}`, params)
  },
  'closed-pledges': (db, scope) => {
    const params: unknown[] = [scope.from, scope.to]
    const customer = pledgeCustomer(scope, params)
    return pledgeList(
      db,
      scope,
      `p.status IN ('redeemed', 'forfeited')
       AND COALESCE(p.redeemed_date, p.pledge_date) >= ? AND COALESCE(p.redeemed_date, p.pledge_date) <= ?${customer}`,
      params,
      true,
    )
  },
  'due-pledges': (db, scope) => {
    const params: unknown[] = [scope.to]
    const customer = pledgeCustomer(scope, params)
    const rows = rowsOf(
      db,
      `SELECT p.receipt_no AS receipt, c.name AS customer, p.repayment_due_date AS due_date,
              p.loan_amount AS loan, p.amount_collected AS collected,
              CASE WHEN p.repayment_due_date < ? THEN 'Overdue' ELSE 'Due' END AS due_state
       FROM pledges p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.status = 'active'
         AND p.repayment_due_date IS NOT NULL
         AND TRIM(p.repayment_due_date) != ''
         AND p.repayment_due_date <= ?${customer}
       ORDER BY p.repayment_due_date, p.id`,
      [scope.to, ...params],
    )
    return result(
      [
        { key: 'receipt', label: 'Receipt' },
        { key: 'customer', label: 'Customer' },
        { key: 'dueDate', label: 'Due date', format: 'date' },
        { key: 'state', label: 'Status' },
        { key: 'loan', label: 'Loan', align: 'right', format: 'money', total: true },
        { key: 'collected', label: 'Collected', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        receipt: text(row.receipt),
        customer: text(row.customer),
        dueDate: text(row.due_date),
        state: text(row.due_state),
        loan: money(row.loan),
        collected: money(row.collected),
      })),
    )
  },
  'customer-wise-pledges': (db, scope) => {
    const params: unknown[] = []
    const customer = pledgeCustomer(scope, params)
    const rows = rowsOf(
      db,
      `SELECT c.name AS customer, COUNT(*) AS pledges,
              SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) AS active,
              SUM(p.loan_amount) AS loan, SUM(p.amount_collected) AS collected
       FROM pledges p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.status != 'draft'${customer}
       GROUP BY p.customer_id
       ORDER BY loan DESC, c.name`,
      params,
    )
    return result(
      [
        { key: 'customer', label: 'Customer' },
        { key: 'pledges', label: 'Pledges', align: 'right', format: 'qty', total: true },
        { key: 'active', label: 'Active', align: 'right', format: 'qty', total: true },
        { key: 'loan', label: 'Loan', align: 'right', format: 'money', total: true },
        { key: 'collected', label: 'Collected', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        customer: text(row.customer),
        pledges: num(row.pledges),
        active: num(row.active),
        loan: money(row.loan),
        collected: money(row.collected),
      })),
    )
  },
  'pledge-transactions': (db, scope) => {
    const params: unknown[] = [scope.from, scope.to]
    const customer = pledgeCustomer(scope, params)
    return pledgeList(
      db,
      scope,
      `p.pledge_date >= ? AND p.pledge_date <= ?${customer}`,
      params,
      true,
    )
  },
  'gst-sales': (db, scope) => {
    const { where, params } = gstWhere(scope)
    const rows = rowsOf(
      db,
      `SELECT strftime('%Y-%m', i.invoice_date) AS month,
              SUM(i.subtotal - i.discount) AS taxable,
              SUM(i.cgst) AS cgst, SUM(i.sgst) AS sgst, SUM(i.igst) AS igst,
              COUNT(*) AS bills
       FROM invoices i
       WHERE ${where}
       GROUP BY strftime('%Y-%m', i.invoice_date)
       ORDER BY month`,
      params,
    )
    return result(
      [
        { key: 'month', label: 'Month' },
        { key: 'taxable', label: 'Taxable', align: 'right', format: 'money', total: true },
        { key: 'cgst', label: 'CGST', align: 'right', format: 'money', total: true },
        { key: 'sgst', label: 'SGST', align: 'right', format: 'money', total: true },
        { key: 'igst', label: 'IGST', align: 'right', format: 'money', total: true },
        { key: 'bills', label: 'Bills', align: 'right', format: 'qty', total: true },
      ],
      rows.map((row) => ({
        month: text(row.month),
        taxable: money(row.taxable),
        cgst: money(row.cgst),
        sgst: money(row.sgst),
        igst: money(row.igst),
        bills: num(row.bills),
      })),
    )
  },
  'gst-purchase': (db, scope) => {
    const { where, params } = inwardWhere(scope)
    const rows = rowsOf(
      db,
      `SELECT strftime('%Y-%m', w.inward_date) AS month,
              SUM(w.subtotal) AS taxable,
              SUM(w.cgst) AS cgst, SUM(w.sgst) AS sgst, SUM(w.igst) AS igst,
              COUNT(*) AS bills
       FROM inwards w
       WHERE ${where}
       GROUP BY strftime('%Y-%m', w.inward_date)
       ORDER BY month`,
      params,
    )
    return result(
      [
        { key: 'month', label: 'Month' },
        { key: 'taxable', label: 'Taxable', align: 'right', format: 'money', total: true },
        { key: 'cgst', label: 'CGST', align: 'right', format: 'money', total: true },
        { key: 'sgst', label: 'SGST', align: 'right', format: 'money', total: true },
        { key: 'igst', label: 'IGST', align: 'right', format: 'money', total: true },
        { key: 'bills', label: 'Bills', align: 'right', format: 'qty', total: true },
      ],
      rows.map((row) => ({
        month: text(row.month),
        taxable: money(row.taxable),
        cgst: money(row.cgst),
        sgst: money(row.sgst),
        igst: money(row.igst),
        bills: num(row.bills),
      })),
    )
  },
  'tax-summary': (db, scope) => {
    const { where, params } = gstWhere(scope)
    const row = oneOf(
      db,
      `SELECT COALESCE(SUM(i.subtotal - i.discount), 0) AS taxable,
              COALESCE(SUM(i.cgst), 0) AS cgst, COALESCE(SUM(i.sgst), 0) AS sgst,
              COALESCE(SUM(i.igst), 0) AS igst, COUNT(i.id) AS bills
       FROM invoices i
       WHERE ${where}`,
      params,
    )
    return result(
      [
        { key: 'taxable', label: 'Taxable', align: 'right', format: 'money' },
        { key: 'cgst', label: 'CGST', align: 'right', format: 'money' },
        { key: 'sgst', label: 'SGST', align: 'right', format: 'money' },
        { key: 'igst', label: 'IGST', align: 'right', format: 'money' },
        { key: 'bills', label: 'Bills', align: 'right', format: 'qty' },
      ],
      [
        {
          taxable: money(row.taxable),
          cgst: money(row.cgst),
          sgst: money(row.sgst),
          igst: money(row.igst),
          bills: num(row.bills),
        },
      ],
    )
  },
  'invoice-register': (db, scope) => {
    const { where, params } = gstWhere(scope)
    const rows = rowsOf(
      db,
      `SELECT i.invoice_date AS date, i.invoice_no AS invoice_no,
              ${paymentLabel('i.bill_format')} AS format, c.name AS customer,
              i.subtotal - i.discount AS taxable, i.cgst AS cgst, i.sgst AS sgst, i.igst AS igst,
              ${PAYABLE} AS total
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE ${where}
       ORDER BY i.invoice_date, i.id`,
      params,
    )
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'invoiceNo', label: 'Invoice' },
        { key: 'format', label: 'Format' },
        { key: 'customer', label: 'Customer' },
        { key: 'taxable', label: 'Taxable', align: 'right', format: 'money', total: true },
        { key: 'cgst', label: 'CGST', align: 'right', format: 'money', total: true },
        { key: 'sgst', label: 'SGST', align: 'right', format: 'money', total: true },
        { key: 'igst', label: 'IGST', align: 'right', format: 'money', total: true },
        { key: 'total', label: 'Payable', align: 'right', format: 'money', total: true },
      ],
      rows.map((row) => ({
        date: text(row.date),
        invoiceNo: text(row.invoice_no),
        format: text(row.format),
        customer: text(row.customer),
        taxable: money(row.taxable),
        cgst: money(row.cgst),
        sgst: money(row.sgst),
        igst: money(row.igst),
        total: money(row.total),
      })),
    )
  },
  'sales-summary': (db, scope) => {
    const { where, params } = saleWhere(scope)
    const row = oneOf(
      db,
      `SELECT COUNT(*) AS bills,
              COALESCE(SUM(${PAYABLE}), 0) AS payable,
              COALESCE(SUM(i.amount_paid), 0) AS paid,
              COALESCE(SUM(i.balance_due), 0) AS balance,
              COALESCE(SUM(CASE
                WHEN i.is_historical = 1 THEN i.summary_gold_g
                ELSE (
                  SELECT COALESCE(SUM(ii.net_weight * ii.qty), 0)
                  FROM invoice_items ii
                  WHERE ii.invoice_id = i.id AND ii.line_kind = 'sale'
                    AND lower(ii.metal) LIKE '%gold%'
                )
              END), 0) AS gold_g,
              COALESCE(SUM(CASE
                WHEN i.is_historical = 1 THEN i.summary_silver_g
                ELSE (
                  SELECT COALESCE(SUM(ii.net_weight * ii.qty), 0)
                  FROM invoice_items ii
                  WHERE ii.invoice_id = i.id AND ii.line_kind = 'sale'
                    AND lower(ii.metal) LIKE '%silver%'
                )
              END), 0) AS silver_g
       FROM invoices i
       WHERE ${where}`,
      params,
    )
    return result(
      [
        { key: 'bills', label: 'Bills', align: 'right', format: 'qty' },
        { key: 'payable', label: 'Payable', align: 'right', format: 'money' },
        { key: 'paid', label: 'Paid', align: 'right', format: 'money' },
        { key: 'balance', label: 'Balance', align: 'right', format: 'money' },
        { key: 'gold', label: 'Gold (g)', align: 'right', format: 'weight' },
        { key: 'silver', label: 'Silver (g)', align: 'right', format: 'weight' },
      ],
      [
        {
          bills: num(row.bills),
          payable: money(row.payable),
          paid: money(row.paid),
          balance: money(row.balance),
          gold: weight(row.gold_g),
          silver: weight(row.silver_g),
        },
      ],
    )
  },
  'purchase-summary': (db, scope) => {
    const { where, params } = inwardWhere(scope)
    const row = oneOf(
      db,
      `SELECT COUNT(*) AS inwards, COALESCE(SUM(w.total), 0) AS total
       FROM inwards w
       WHERE ${where}`,
      params,
    )
    return result(
      [
        { key: 'inwards', label: 'Inwards', align: 'right', format: 'qty' },
        { key: 'total', label: 'Total', align: 'right', format: 'money' },
      ],
      [{ inwards: num(row.inwards), total: money(row.total) }],
    )
  },
  'gross-profit': () => {
    throw new HttpError(400, 'Sold lines do not store purchase cost.')
  },
  'outstanding-summary': (db) => {
    const ledger = oneOf(
      db,
      `SELECT COUNT(*) AS customers, COALESCE(SUM(balance), 0) AS outstanding
       FROM (
         SELECT SUM(CASE WHEN kind = 'due' THEN amount ELSE -amount END) AS balance
         FROM customer_dues
         GROUP BY customer_id
         HAVING balance > 0.009
       )`,
      [],
    )
    const invoices = oneOf(
      db,
      `SELECT COUNT(*) AS bills, COALESCE(SUM(i.balance_due), 0) AS balance
       FROM invoices i
       WHERE ${FINAL_SALE} AND i.balance_due > 0.009`,
      [],
    )
    return result(
      [
        { key: 'metric', label: 'Metric' },
        { key: 'count', label: 'Count', align: 'right', format: 'qty' },
        { key: 'amount', label: 'Amount', align: 'right', format: 'money' },
      ],
      [
        {
          metric: 'Customer ledger outstanding',
          count: num(ledger.customers),
          amount: money(ledger.outstanding),
        },
        {
          metric: 'Invoice balance due',
          count: num(invoices.bills),
          amount: money(invoices.balance),
        },
      ],
    )
  },
  'daily-business-summary': (db, scope) => {
    const sales = runners['daily-sales'](db, scope)
    const purchases = runners['date-wise-purchases'](db, scope)
    const collections = runners['daily-collection'](db, scope)
    const byDate = new Map<string, { sales: number; purchases: number; collections: number }>()
    const ensure = (date: string) => {
      const key = date.slice(0, 10)
      const existing = byDate.get(key)
      if (existing) return existing
      const created = { sales: 0, purchases: 0, collections: 0 }
      byDate.set(key, created)
      return created
    }
    for (const row of sales.rows) {
      ensure(String(row.date)).sales = num(row.payable)
    }
    for (const row of purchases.rows) {
      ensure(String(row.date)).purchases = num(row.total)
    }
    for (const row of collections.rows) {
      ensure(String(row.date)).collections = num(row.amount)
    }
    const rows = [...byDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, values]) => ({
        date,
        sales: money(values.sales),
        purchases: money(values.purchases),
        collections: money(values.collections),
      }))
    return result(
      [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'sales', label: 'Sales', align: 'right', format: 'money', total: true },
        { key: 'purchases', label: 'Purchases', align: 'right', format: 'money', total: true },
        { key: 'collections', label: 'Collections', align: 'right', format: 'money', total: true },
      ],
      rows,
    )
  },
}

function collectionDetail(db: ReturnType<typeof getDatabase>, scope: Scope, mode?: string) {
  const { sql, params } = collectionSql(scope, mode)
  const rows = rowsOf(
    db,
    `${sql} ORDER BY entry_date, document_no`,
    params,
  )
  return result(
    collectionColumns,
    rows.map((row) => ({
      date: text(row.entry_date).slice(0, 10),
      customer: text(row.customer_name),
      document: text(row.document_no),
      mode: text(row.mode),
      amount: money(row.amount),
      note: text(row.note),
    })),
  )
}

function metalMovement(
  db: ReturnType<typeof getDatabase>,
  scope: Scope,
  type: 'purchase' | 'sale',
  label: string,
) {
  const params: unknown[] = [scope.from, scope.to, type]
  const metal = metalClause('metal', scope, params)
  const sign = type === 'sale' ? '-weight_delta' : 'weight_delta'
  const rows = rowsOf(
    db,
    `SELECT metal, SUM(${sign}) AS weight
     FROM stock_movements
     WHERE movement_date >= ? AND movement_date <= ? AND movement_type = ?${metal}
     GROUP BY metal
     ORDER BY metal`,
    params,
  )
  return result(
    [
      { key: 'metal', label: 'Metal' },
      { key: 'weight', label, align: 'right', format: 'weight', total: true },
    ],
    rows.map((row) => ({
      metal: text(row.metal),
      weight: weight(row.weight),
    })),
  )
}

function pledgeList(
  db: ReturnType<typeof getDatabase>,
  _scope: Scope,
  where: string,
  params: unknown[] = [],
  includeClosed = false,
) {
  const rows = rowsOf(
    db,
    `SELECT p.pledge_date AS date, p.receipt_no AS receipt, c.name AS customer, p.status AS status,
            p.loan_amount AS loan, p.assessed_value AS assessed, p.amount_collected AS collected,
            p.repayment_due_date AS due_date, p.redeemed_date AS closed_date
     FROM pledges p
     JOIN customers c ON c.id = p.customer_id
     WHERE ${where}
     ORDER BY p.pledge_date, p.id`,
    params,
  )
  const columns: ReportColumn[] = [
    { key: 'date', label: 'Date', format: 'date' },
    { key: 'receipt', label: 'Receipt' },
    { key: 'customer', label: 'Customer' },
    { key: 'status', label: 'Status' },
    { key: 'loan', label: 'Loan', align: 'right', format: 'money', total: true },
    { key: 'assessed', label: 'Assessed', align: 'right', format: 'money', total: true },
    { key: 'collected', label: 'Collected', align: 'right', format: 'money', total: true },
    { key: 'dueDate', label: 'Due date', format: 'date' },
  ]
  if (includeClosed) {
    columns.push({ key: 'closedDate', label: 'Closed date', format: 'date' })
  }
  return result(
    columns,
    rows.map((row) => ({
      date: text(row.date),
      receipt: text(row.receipt),
      customer: text(row.customer),
      status: text(row.status),
      loan: money(row.loan),
      assessed: money(row.assessed),
      collected: money(row.collected),
      dueDate: text(row.due_date),
      ...(includeClosed ? { closedDate: text(row.closed_date) } : {}),
    })),
  )
}

export function runReport(id: ReportId, query: z.infer<typeof reportQuerySchema>): ReportResult {
  const report = findReport(id)
  if (!report) {
    throw new HttpError(404, 'Report not found')
  }
  if (!report.available) {
    throw new HttpError(400, report.unavailableReason ?? 'This report is not available')
  }
  const scope = resolveScope(report, query)
  return runners[id](getDatabase(), scope)
}
