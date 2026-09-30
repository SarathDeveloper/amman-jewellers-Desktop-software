import type Database from 'better-sqlite3'
import { STOCK_ITEM_NAMES, STOCK_METALS } from '@shared/itemTypes'
import { syncDueEntryForFinalInvoice } from '../dues/invoiceSync'

const DEMO_CUSTOMER_NAMES = [
  'Ravi Kumar',
  'Priya',
  'Suresh',
  'Meena',
  'Kumar',
  'Anitha',
  'Murugesan',
  'Lakshmi Devi',
  'Ramesh Kumar',
  'Selvam Jewellers',
  'Karthik',
  'Govind',
  'Vijay',
  'Deepa',
  'Senthil',
  'Kavitha',
  'Arun',
  'Divya',
  'Manoj',
  'Nandhini',
] as const

type ProductRow = {
  id: number
  name: string
  category: string
  metal: string
  net_weight: number
  gross_weight: number
  making_charges: number
}

function addDaysIso(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function invoicesEmpty(database: Database.Database): boolean {
  const row = database.prepare('SELECT COUNT(*) AS count FROM invoices').get() as { count: number }
  return row.count === 0
}

function ensureDemoCustomers(database: Database.Database): Map<string, number> {
  const byName = new Map<string, number>()
  const select = database.prepare('SELECT id, name FROM customers WHERE name = ?')
  const insert = database.prepare(
    `INSERT INTO customers (name, phone, address, notes, created_at)
     VALUES (?, ?, ?, '', datetime('now'))`,
  )

  for (const name of DEMO_CUSTOMER_NAMES) {
    const existing = select.get(name) as { id: number } | undefined
    if (existing) {
      byName.set(name, existing.id)
      continue
    }
    const phone = `9${String(byName.size).padStart(9, '0')}`
    const result = insert.run(name, phone, 'Salem district')
    byName.set(name, Number(result.lastInsertRowid))
  }

  const all = database.prepare('SELECT id, name FROM customers').all() as { id: number; name: string }[]
  for (const row of all) {
    byName.set(row.name, row.id)
  }
  return byName
}

function bumpProductStock(database: Database.Database): void {
  database.prepare(`UPDATE products SET stock_qty = stock_qty + 500, updated_at = datetime('now')`).run()
}

function seedMetalStockToday(database: Database.Database, today: string): void {
  const upsert = database.prepare(
    `INSERT INTO item_stock_days (stock_date, metal, item_name, opening_weight, sales_override, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(stock_date, metal, item_name) DO UPDATE SET
       opening_weight = excluded.opening_weight,
       sales_override = excluded.sales_override,
       updated_at = datetime('now')`,
  )

  const goldOpening = 1245.6
  const silverOpening = 8420
  const goldSold = 84.2
  const silverSold = 620

  upsert.run(today, STOCK_METALS[0], 'Chain', goldOpening, goldSold)
  for (const itemName of STOCK_ITEM_NAMES) {
    if (itemName === 'Chain') {
      continue
    }
    upsert.run(today, STOCK_METALS[0], itemName, 0, null)
  }

  upsert.run(today, STOCK_METALS[1], 'Chain', silverOpening, silverSold)
  for (const itemName of STOCK_ITEM_NAMES) {
    if (itemName === 'Chain') {
      continue
    }
    upsert.run(today, STOCK_METALS[1], itemName, 0, null)
  }
}

type SeedInvoiceSpec = {
  invoiceNo: string
  customerName: string
  invoiceDate: string
  createdAt: string
  total: number
  amountPaid: number
  paymentMode: 'cash' | 'upi' | 'card' | 'mixed'
  status: 'draft' | 'final'
  qty: number
}

function insertInvoice(
  database: Database.Database,
  customers: Map<string, number>,
  product: ProductRow,
  spec: SeedInvoiceSpec,
): number {
  const customerId = customers.get(spec.customerName)
  if (!customerId) {
    throw new Error(`Missing demo customer: ${spec.customerName}`)
  }

  const balanceDue = Math.max(0, spec.total - spec.amountPaid)
  const result = database
    .prepare(
      `INSERT INTO invoices (
        customer_id, invoice_no, invoice_date, subtotal, tax, total, status, created_at,
        bill_format, payment_mode, amount_paid, balance_due, discount, cgst, sgst, igst, is_estimate,
        round_off, amount_payable
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'cash_bill', ?, ?, ?, 0, 0, 0, 0, 0, 0, ?)`,
    )
    .run(
      customerId,
      spec.invoiceNo,
      spec.invoiceDate,
      spec.total,
      spec.total,
      spec.status,
      spec.createdAt,
      spec.paymentMode,
      spec.amountPaid,
      balanceDue,
      spec.total,
    )

  const invoiceId = Number(result.lastInsertRowid)
  const rate = spec.total / spec.qty

  database
    .prepare(
      `INSERT INTO invoice_items (
        invoice_id, product_id, qty, rate, line_total,
        gross_weight, net_weight, stone_weight, metal_rate, making_charges,
        wastage_pct, stone_rate, line_subtotal, line_tax, hsn_code, metal, category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 0, ?, 0, '', ?, ?)`,
    )
    .run(
      invoiceId,
      product.id,
      spec.qty,
      rate,
      spec.total,
      product.gross_weight,
      product.net_weight,
      product.making_charges,
      spec.total,
      product.metal,
      product.category,
    )

  if (spec.status === 'final') {
    database
      .prepare(`UPDATE products SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ?`)
      .run(spec.qty, product.id)
    syncDueEntryForFinalInvoice(database, invoiceId)
  }

  return invoiceId
}

function buildTodayFinalSpecs(today: string): SeedInvoiceSpec[] {
  const specs: SeedInvoiceSpec[] = []
  const fillerCustomers = [
    'Murugesan',
    'Lakshmi Devi',
    'Ramesh Kumar',
    'Selvam Jewellers',
    'Karthik',
    'Govind',
    'Vijay',
    'Deepa',
    'Senthil',
    'Kavitha',
    'Arun',
    'Divya',
    'Manoj',
    'Nandhini',
    'Murugesan',
    'Lakshmi Devi',
    'Ramesh Kumar',
    'Selvam Jewellers',
    'Karthik',
    'Govind',
  ]
  const fillerTotals = [
    4200, 3800, 5100, 3600, 4500, 3900, 4100, 3700, 4300, 4000, 3500, 4200, 3800, 4100, 3900, 4000,
    3700, 3600, 3800, 3750,
  ]
  const fillerQty = [2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1]

  for (let i = 0; i < fillerCustomers.length; i += 1) {
    const hour = 9 + Math.floor(i / 2)
    const invoiceSeq = 23 + i
    specs.push({
      invoiceNo: `JTP-2026-${String(invoiceSeq).padStart(4, '0')}`,
      customerName: fillerCustomers[i],
      invoiceDate: today,
      createdAt: `${today}T${String(hour).padStart(2, '0')}:${String((i % 2) * 30).padStart(2, '0')}:00`,
      total: fillerTotals[i],
      amountPaid: fillerTotals[i],
      paymentMode: i % 3 === 0 ? 'upi' : 'cash',
      status: 'final',
      qty: fillerQty[i],
    })
  }

  specs.push({
    invoiceNo: 'JTP-2026-0015',
    customerName: 'Meena',
    invoiceDate: today,
    createdAt: `${today}T17:10:00`,
    total: 12450,
    amountPaid: 12450,
    paymentMode: 'cash',
    status: 'final',
    qty: 1,
  })
  specs.push({
    invoiceNo: 'JTP-2026-0016',
    customerName: 'Suresh',
    invoiceDate: today,
    createdAt: `${today}T17:45:00`,
    total: 31800,
    amountPaid: 22300,
    paymentMode: 'card',
    status: 'final',
    qty: 2,
  })
  specs.push({
    invoiceNo: 'JTP-2026-0017',
    customerName: 'Priya',
    invoiceDate: today,
    createdAt: `${today}T18:20:00`,
    total: 18200,
    amountPaid: 18200,
    paymentMode: 'cash',
    status: 'final',
    qty: 1,
  })
  specs.push({
    invoiceNo: 'JTP-2026-0018',
    customerName: 'Ravi Kumar',
    invoiceDate: today,
    createdAt: `${today}T19:05:00`,
    total: 42500,
    amountPaid: 42500,
    paymentMode: 'upi',
    status: 'final',
    qty: 2,
  })
  return specs
}

function buildOlderDueSpecs(today: string): SeedInvoiceSpec[] {
  return [
    {
      invoiceNo: 'JTP-2026-0001',
      customerName: 'Ravi Kumar',
      invoiceDate: addDaysIso(today, -12),
      createdAt: `${addDaysIso(today, -12)}T11:00:00`,
      total: 15000,
      amountPaid: 0,
      paymentMode: 'card',
      status: 'final',
      qty: 1,
    },
    {
      invoiceNo: 'JTP-2026-0002',
      customerName: 'Meena',
      invoiceDate: addDaysIso(today, -5),
      createdAt: `${addDaysIso(today, -5)}T12:00:00`,
      total: 6000,
      amountPaid: 0,
      paymentMode: 'cash',
      status: 'final',
      qty: 1,
    },
    {
      invoiceNo: 'JTP-2026-0003',
      customerName: 'Kumar',
      invoiceDate: addDaysIso(today, -3),
      createdAt: `${addDaysIso(today, -3)}T10:30:00`,
      total: 4800,
      amountPaid: 0,
      paymentMode: 'upi',
      status: 'final',
      qty: 1,
    },
    {
      invoiceNo: 'JTP-2026-0004',
      customerName: 'Anitha',
      invoiceDate: addDaysIso(today, -7),
      createdAt: `${addDaysIso(today, -7)}T15:00:00`,
      total: 3200,
      amountPaid: 0,
      paymentMode: 'cash',
      status: 'final',
      qty: 1,
    },
  ]
}

function buildDraftSpecs(today: string): SeedInvoiceSpec[] {
  return [
    {
      invoiceNo: 'JTP-2026-0019',
      customerName: 'Suresh',
      invoiceDate: today,
      createdAt: `${today}T19:40:00`,
      total: 9750,
      amountPaid: 0,
      paymentMode: 'mixed',
      status: 'draft',
      qty: 1,
    },
    {
      invoiceNo: 'JTP-2026-0020',
      customerName: 'Vijay',
      invoiceDate: today,
      createdAt: `${today}T11:20:00`,
      total: 5200,
      amountPaid: 0,
      paymentMode: 'cash',
      status: 'draft',
      qty: 1,
    },
    {
      invoiceNo: 'JTP-2026-0021',
      customerName: 'Deepa',
      invoiceDate: today,
      createdAt: `${today}T13:15:00`,
      total: 6100,
      amountPaid: 0,
      paymentMode: 'upi',
      status: 'draft',
      qty: 1,
    },
    {
      invoiceNo: 'JTP-2026-0022',
      customerName: 'Arun',
      invoiceDate: today,
      createdAt: `${today}T14:05:00`,
      total: 4400,
      amountPaid: 0,
      paymentMode: 'card',
      status: 'draft',
      qty: 1,
    },
  ]
}

/** Inserts demo invoices, dues, and stock rows when the invoices table is empty. */
export function seedSampleDashboardIfEmpty(database: Database.Database): boolean {
  if (!invoicesEmpty(database)) {
    return false
  }

  const productCount = database.prepare('SELECT COUNT(*) AS count FROM products').get() as {
    count: number
  }
  if (productCount.count === 0) {
    return false
  }

  const today = new Date().toISOString().slice(0, 10)
  const customers = ensureDemoCustomers(database)
  const product = database
    .prepare(`SELECT id, name, category, metal, net_weight, gross_weight, making_charges FROM products LIMIT 1`)
    .get() as ProductRow

  bumpProductStock(database)

  const tx = database.transaction(() => {
    for (const spec of buildOlderDueSpecs(today)) {
      insertInvoice(database, customers, product, spec)
    }
    for (const spec of buildTodayFinalSpecs(today)) {
      insertInvoice(database, customers, product, spec)
    }
    for (const spec of buildDraftSpecs(today)) {
      insertInvoice(database, customers, product, spec)
    }
    seedMetalStockToday(database, today)
  })

  tx()
  return true
}

export function countSeededInvoices(database: Database.Database): number {
  const row = database.prepare('SELECT COUNT(*) AS count FROM invoices').get() as { count: number }
  return row.count
}
