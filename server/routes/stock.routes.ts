import { Router } from 'express'
import {
  itemStockListSchema,
  itemStockUpsertSchema,
  metalDayCloseSchema,
  metalDayClosingGetSchema,
  metalDayReopenSchema,
  stockCategoryCreateSchema,
  stockCategoryDeleteSchema,
  stockCategoryUpdateSchema,
  stockClearOverridesSchema,
  stockDayLinesSchema,
  stockHistorySchema,
  stockReconciliationSchema,
} from '@shared/schemas'
import type {
  DayClosePrecheck,
  ItemStockRow,
  ItemStockUpsertInput,
  MetalDayCloseInput,
  MetalDayClosingHistoryRow,
  MetalDayClosingSheet,
  MetalDayPieceRow,
  MetalDayReopenInput,
  StockCategoryCreateInput,
  StockCategoryUpdateInput,
  StockDayLine,
  StockHistoryRow,
  StockReconciliationRow,
} from '@shared/types'
import { STOCK_METALS } from '@shared/itemTypes'
import { getDatabase } from '../db'
import { assertMetalDayOpen, isMetalDayClosed } from '../db/metalDayClosing'
import {
  findCategoryByName,
  listCategoryNames,
  listCategoryRows,
  mapCategory,
  requireCategory,
  type CategoryRow,
} from '../db/stockCategories'
import { asyncHandler, parseBody } from '../lib/http'
import { requireRole } from '../auth/middleware'

const router = Router()

type StockDayRow = {
  opening_weight: number
  sales_override: number | null
  override_reason: string
  override_reference_id: number | null
}

type SnapshotLineRow = {
  item_name: string
  opening_weight: number
  inward_weight: number
  sales_weight: number
  exchange_weight: number
  closing_weight: number
  sales_override: number | null
}

const HISTORY_LIMIT = 90

function addDaysIso(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function getSavedRow(stockDate: string, metal: string, itemName: string): StockDayRow | undefined {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT opening_weight, sales_override, override_reason, override_reference_id
       FROM item_stock_days
       WHERE stock_date = ? AND metal = ? AND item_name = ?`,
    )
    .get(stockDate, metal, itemName) as StockDayRow | undefined
}

function getAutoSales(stockDate: string, metal: string, itemName: string): number {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT COALESCE(-SUM(weight_delta), 0) AS total
       FROM stock_movements
       WHERE movement_date = ?
         AND movement_type = 'sale'
         AND lower(trim(metal)) = lower(trim(?))
         AND lower(trim(category)) = lower(trim(?))`,
    )
    .get(stockDate, metal, itemName) as { total: number }
  return row.total
}

function getAutoPurchaseIn(stockDate: string, metal: string, itemName: string): number {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(weight_delta), 0) AS total
       FROM stock_movements
       WHERE movement_date = ?
         AND movement_type = 'purchase'
         AND lower(trim(metal)) = lower(trim(?))
         AND lower(trim(category)) = lower(trim(?))`,
    )
    .get(stockDate, metal, itemName) as { total: number }
  return row.total
}

function getOpeningMovementsOnDate(stockDate: string, metal: string, itemName: string): number {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(weight_delta), 0) AS total
       FROM stock_movements
       WHERE movement_date = ?
         AND movement_type = 'opening'
         AND lower(trim(metal)) = lower(trim(?))
         AND lower(trim(category)) = lower(trim(?))`,
    )
    .get(stockDate, metal, itemName) as { total: number }
  return row.total
}

const MAX_CARRY_BACK_DAYS = 366

function getClosingForDate(stockDate: string, metal: string, itemName: string, depth = 0): number {
  const opening = getOpeningForDate(stockDate, metal, itemName, depth)
  const openingMovements = getOpeningMovementsOnDate(stockDate, metal, itemName)
  const saved = getSavedRow(stockDate, metal, itemName)
  const autoSales = getAutoSales(stockDate, metal, itemName)
  const autoPurchaseIn = getAutoPurchaseIn(stockDate, metal, itemName)
  const effectiveSales = saved?.sales_override ?? autoSales
  return opening + openingMovements + autoPurchaseIn - effectiveSales
}

function getOpeningForDate(stockDate: string, metal: string, itemName: string, depth = 0): number {
  if (depth > MAX_CARRY_BACK_DAYS) {
    return 0
  }
  const saved = getSavedRow(stockDate, metal, itemName)
  if (saved) {
    return saved.opening_weight
  }
  if (depth === 0) {
    const db = getDatabase()
    const hasPrior = db
      .prepare(
        `SELECT 1
         FROM (
           SELECT stock_date AS d FROM item_stock_days
           WHERE stock_date < ? AND lower(trim(metal)) = lower(trim(?)) AND lower(trim(item_name)) = lower(trim(?))
           UNION
           SELECT movement_date AS d FROM stock_movements
           WHERE movement_date < ? AND lower(trim(metal)) = lower(trim(?)) AND lower(trim(category)) = lower(trim(?))
         )
         LIMIT 1`,
      )
      .get(stockDate, metal, itemName, stockDate, metal, itemName)
    if (!hasPrior) {
      return 0
    }
  }
  const prevDate = addDaysIso(stockDate, -1)
  if (prevDate >= stockDate) {
    return 0
  }
  return getClosingForDate(prevDate, metal, itemName, depth + 1)
}

function buildLiveRow(stockDate: string, metal: string, itemName: string): ItemStockRow {
  const saved = getSavedRow(stockDate, metal, itemName)
  const openingMovements = getOpeningMovementsOnDate(stockDate, metal, itemName)
  const openingWeight = getOpeningForDate(stockDate, metal, itemName) + openingMovements
  const autoSales = getAutoSales(stockDate, metal, itemName)
  const autoPurchaseIn = getAutoPurchaseIn(stockDate, metal, itemName)
  const salesOverride = saved?.sales_override ?? null
  const effectiveSales = salesOverride ?? autoSales
  return {
    itemName,
    openingWeight,
    autoPurchaseIn,
    autoSales,
    autoExchangeIn: 0,
    salesOverride,
    overrideReason: saved?.override_reason ?? '',
    overrideReferenceId: saved?.override_reference_id ?? null,
    effectiveSales,
    closingWeight: openingWeight + autoPurchaseIn - effectiveSales,
  }
}

function mapSnapshotRow(row: SnapshotLineRow): ItemStockRow {
  return {
    itemName: row.item_name,
    openingWeight: row.opening_weight,
    autoPurchaseIn: row.inward_weight,
    autoSales: row.sales_weight,
    autoExchangeIn: 0,
    salesOverride: row.sales_override,
    overrideReason: '',
    overrideReferenceId: null,
    effectiveSales: row.sales_weight,
    closingWeight: row.closing_weight,
  }
}

function categoryNames(): string[] {
  return listCategoryNames(getDatabase())
}

function listSnapshotRows(stockDate: string, metal: string): ItemStockRow[] | null {
  if (!isMetalDayClosed(getDatabase(), stockDate, metal)) {
    return null
  }
  const rows = getDatabase()
    .prepare(
      `SELECT item_name, opening_weight, inward_weight, sales_weight, exchange_weight,
              closing_weight, sales_override
       FROM metal_day_closing_lines
       WHERE business_date = ? AND metal = ?
       ORDER BY item_name`,
    )
    .all(stockDate, metal) as SnapshotLineRow[]
  return rows.map(mapSnapshotRow)
}

export function listRowsForMetal(stockDate: string, metal: string): ItemStockRow[] {
  const snapshot = listSnapshotRows(stockDate, metal)
  if (snapshot) {
    return snapshot
  }
  return categoryNames().map((itemName) => buildLiveRow(stockDate, metal, itemName))
}

function persistStockDay(input: ItemStockUpsertInput): ItemStockRow {
  const db = getDatabase()
  requireCategory(db, input.itemName)
  assertMetalDayOpen(db, input.stockDate, input.metal)
  const existing = getSavedRow(input.stockDate, input.metal, input.itemName)
  const openingMovements = getOpeningMovementsOnDate(input.stockDate, input.metal, input.itemName)
  // The entered opening is the figure shown on the day sheet. Same-day product
  // opening movements are added again when the row is built, so store the net.
  const openingWeight =
    input.openingWeight !== undefined
      ? input.openingWeight - openingMovements
      : (existing?.opening_weight ??
          getOpeningForDate(input.stockDate, input.metal, input.itemName))

  const salesOverride =
    input.salesOverride !== undefined ? input.salesOverride : (existing?.sales_override ?? null)
  const overrideReason =
    salesOverride == null
      ? ''
      : (input.overrideReason ?? existing?.override_reason ?? '')
  const overrideReferenceId =
    salesOverride == null
      ? null
      : (input.overrideReferenceId !== undefined
          ? input.overrideReferenceId
          : (existing?.override_reference_id ?? null))

  db.prepare(
    `INSERT INTO item_stock_days (
       stock_date, metal, item_name, opening_weight, sales_override,
       override_reason, override_reference_id, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(stock_date, metal, item_name) DO UPDATE SET
       opening_weight = excluded.opening_weight,
       sales_override = excluded.sales_override,
       override_reason = excluded.override_reason,
       override_reference_id = excluded.override_reference_id,
       updated_at = datetime('now')`,
  ).run(
    input.stockDate,
    input.metal,
    input.itemName,
    openingWeight,
    salesOverride,
    overrideReason,
    overrideReferenceId,
  )

  return buildLiveRow(input.stockDate, input.metal, input.itemName)
}

function sumRows(rows: ItemStockRow[]): Omit<StockHistoryRow, 'stockDate'> {
  return rows.reduce(
    (acc, row) => ({
      openingWeight: acc.openingWeight + row.openingWeight,
      inwardWeight: acc.inwardWeight + row.autoPurchaseIn,
      salesWeight: acc.salesWeight + row.effectiveSales,
      closingWeight: acc.closingWeight + row.closingWeight,
    }),
    {
      openingWeight: 0,
      inwardWeight: 0,
      salesWeight: 0,
      closingWeight: 0,
    },
  )
}

function listPieceRowsForDay(stockDate: string, metal: string): MetalDayPieceRow[] {
  const db = getDatabase()
  const inRows = db
    .prepare(
      `SELECT ii.product_id AS productId,
              COALESCE(p.name, 'Product #' || ii.product_id) AS productName,
              SUM(ii.qty) AS qtyIn
       FROM inward_items ii
       JOIN inwards i ON i.id = ii.inward_id
       LEFT JOIN products p ON p.id = ii.product_id
       WHERE i.status = 'final'
         AND i.inward_date = ?
         AND lower(trim(ii.metal)) = lower(trim(?))
         AND ii.product_id IS NOT NULL
       GROUP BY ii.product_id`,
    )
    .all(stockDate, metal) as Array<{
    productId: number
    productName: string
    qtyIn: number
  }>

  const outRows = db
    .prepare(
      `SELECT ii.product_id AS productId,
              COALESCE(NULLIF(ii.description, ''), p.name, 'Product #' || ii.product_id) AS productName,
              SUM(ii.qty) AS qtyOut
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       LEFT JOIN products p ON p.id = ii.product_id
       WHERE i.status = 'final'
         AND i.is_estimate = 0
         AND i.is_historical = 0
         AND i.invoice_date = ?
         AND COALESCE(ii.line_kind, 'sale') = 'sale'
         AND lower(trim(ii.metal)) = lower(trim(?))
         AND ii.product_id IS NOT NULL
       GROUP BY ii.product_id`,
    )
    .all(stockDate, metal) as Array<{
    productId: number
    productName: string
    qtyOut: number
  }>

  const byId = new Map<number, MetalDayPieceRow>()
  for (const row of inRows) {
    byId.set(row.productId, {
      productId: row.productId,
      productName: row.productName,
      qtyIn: row.qtyIn,
      qtyOut: 0,
      netQty: row.qtyIn,
    })
  }
  for (const row of outRows) {
    const existing = byId.get(row.productId)
    if (existing) {
      existing.qtyOut = row.qtyOut
      existing.netQty = existing.qtyIn - row.qtyOut
    } else {
      byId.set(row.productId, {
        productId: row.productId,
        productName: row.productName,
        qtyIn: 0,
        qtyOut: row.qtyOut,
        netQty: -row.qtyOut,
      })
    }
  }
  return [...byId.values()].sort((a, b) => a.productName.localeCompare(b.productName))
}

function getClosingMeta(businessDate: string, metal: string) {
  return getDatabase()
    .prepare(
      `SELECT status, operator_name, note, closed_at
       FROM metal_day_closings
       WHERE business_date = ? AND metal = ?`,
    )
    .get(businessDate, metal) as
    | {
        status: 'open' | 'closed'
        operator_name: string
        note: string
        closed_at: string | null
      }
    | undefined
}

const RECONCILE_FLAG_GRAMS = 0.1

function buildDayClosePrecheck(businessDate: string, metal: string): DayClosePrecheck {
  const db = getDatabase()
  const openDrafts = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM invoices
         WHERE status = 'draft' AND invoice_date = ?
           AND EXISTS (
             SELECT 1 FROM invoice_items ii
             WHERE ii.invoice_id = invoices.id
               AND lower(trim(ii.metal)) = lower(trim(?))
           )`,
      )
      .get(businessDate, metal) as { count: number }
  ).count
  const openInwards = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM inwards
         WHERE status = 'draft' AND inward_date = ?
           AND EXISTS (
             SELECT 1 FROM inward_items ii
             WHERE ii.inward_id = inwards.id
               AND lower(trim(ii.metal)) = lower(trim(?))
           )`,
      )
      .get(businessDate, metal) as { count: number }
  ).count
  const unpaidDues = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM customer_dues
         WHERE entry_date = ? AND kind = 'due'`,
      )
      .get(businessDate) as { count: number }
  ).count
  return { businessDate, metal, openDrafts, openInwards, unpaidDues }
}

function assertDayCloseable(businessDate: string, metal: string): void {
  const precheck = buildDayClosePrecheck(businessDate, metal)
  if (precheck.openDrafts > 0 || precheck.openInwards > 0) {
    throw new Error(
      `Cannot close: ${precheck.openDrafts} open draft bills and ${precheck.openInwards} open inwards for this metal on this date. Finalize or delete them first.`,
    )
  }
}

function getPieceImpliedWeight(metal: string, category: string): number {
  const row = getDatabase()
    .prepare(
      `SELECT COALESCE(SUM(net_weight * stock_qty), 0) AS total
       FROM products
       WHERE lower(trim(metal)) = lower(trim(?))
         AND lower(trim(category)) = lower(trim(?))`,
    )
    .get(metal, category) as { total: number }
  return row.total
}

function getRawMetalInward(stockDate: string, metal: string, category: string): number {
  const row = getDatabase()
    .prepare(
      `SELECT COALESCE(SUM(ii.net_weight * ii.qty), 0) AS total
       FROM inward_items ii
       JOIN inwards i ON i.id = ii.inward_id
       WHERE i.status = 'final'
         AND i.inward_date = ?
         AND ii.product_id IS NULL
         AND lower(trim(ii.metal)) = lower(trim(?))
         AND lower(trim(ii.category)) = lower(trim(?))`,
    )
    .get(stockDate, metal, category) as { total: number }
  return row.total
}

function buildReconciliation(stockDate: string): StockReconciliationRow[] {
  const rows: StockReconciliationRow[] = []
  for (const metal of STOCK_METALS) {
    for (const category of categoryNames()) {
      const live = buildLiveRow(stockDate, metal, category)
      const ledgerClosing = live.closingWeight
      const pieceImpliedWeight = getPieceImpliedWeight(metal, category)
      const rawMetalInward = getRawMetalInward(stockDate, metal, category)
      const expectedDelta = rawMetalInward
      const actualDelta = ledgerClosing - pieceImpliedWeight
      const unexplained = actualDelta - expectedDelta
      rows.push({
        metal,
        category,
        ledgerClosing,
        pieceImpliedWeight,
        rawMetalInward,
        expectedDelta,
        actualDelta,
        unexplained,
        flagged: Math.abs(unexplained) > RECONCILE_FLAG_GRAMS,
      })
    }
  }
  return rows
}

function buildDaySheet(businessDate: string, metal: string): MetalDayClosingSheet {
  const meta = getClosingMeta(businessDate, metal)
  return {
    businessDate,
    metal,
    status: meta?.status === 'closed' ? 'closed' : 'open',
    operatorName: meta?.operator_name ?? '',
    note: meta?.note ?? '',
    closedAt: meta?.closed_at ?? null,
    rows: listRowsForMetal(businessDate, metal),
    pieceRows: listPieceRowsForDay(businessDate, metal),
  }
}

router.get(
  '/',
  asyncHandler((req, res) => {
    const { stockDate, metal } = parseBody(itemStockListSchema, {
      stockDate: req.query.stockDate,
      metal: req.query.metal,
    })
    res.json(listRowsForMetal(stockDate, metal))
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(itemStockUpsertSchema, req.body)
    res.json(persistStockDay(input))
  }),
)

router.post(
  '/clear-overrides',
  asyncHandler((req, res) => {
    const { stockDate, metal } = parseBody(stockClearOverridesSchema, req.body)
    assertMetalDayOpen(getDatabase(), stockDate, metal)
    getDatabase()
      .prepare(
        `UPDATE item_stock_days
         SET sales_override = NULL, override_reason = '', override_reference_id = NULL,
             updated_at = datetime('now')
         WHERE stock_date = ? AND metal = ?`,
      )
      .run(stockDate, metal)
    res.json(listRowsForMetal(stockDate, metal))
  }),
)

router.get(
  '/history',
  asyncHandler((req, res) => {
    const { metal } = parseBody(stockHistorySchema, { metal: req.query.metal })
    const db = getDatabase()
    const dates = db
      .prepare(
        `SELECT d FROM (
           SELECT DISTINCT stock_date AS d FROM item_stock_days WHERE metal = ?
           UNION
           SELECT DISTINCT i.invoice_date AS d
           FROM invoices i
           JOIN invoice_items ii ON ii.invoice_id = i.id
           WHERE i.status = 'final'
             AND i.is_estimate = 0
             AND i.is_historical = 0
             AND lower(trim(ii.metal)) = lower(trim(?))
           UNION
           SELECT DISTINCT i.inward_date AS d
           FROM inwards i
           JOIN inward_items ii ON ii.inward_id = i.id
           WHERE i.status = 'final'
             AND lower(trim(ii.metal)) = lower(trim(?))
           UNION
           SELECT DISTINCT business_date AS d
           FROM metal_day_closings
           WHERE metal = ?
         )
         ORDER BY d DESC
         LIMIT ?`,
      )
      .all(metal, metal, metal, metal, HISTORY_LIMIT) as { d: string }[]

    res.json(
      dates.map((row) => ({
        stockDate: row.d,
        ...sumRows(listRowsForMetal(row.d, metal)),
      })),
    )
  }),
)

router.get(
  '/day-lines',
  asyncHandler((req, res) => {
    const { stockDate, metal, itemName, kind } = parseBody(stockDayLinesSchema, {
      stockDate: req.query.stockDate,
      metal: req.query.metal,
      itemName: req.query.itemName,
      kind: req.query.kind,
    })
    const db = getDatabase()
    let lines: StockDayLine[] = []

    if (kind === 'inward') {
      const rows = db
        .prepare(
          `SELECT i.id AS documentId, i.inward_no AS documentNo, i.inward_date AS documentDate,
                  p.name AS productName, ii.qty, ii.net_weight AS netWeight,
                  (ii.net_weight * ii.qty) AS weightTotal
           FROM inward_items ii
           JOIN inwards i ON i.id = ii.inward_id
           LEFT JOIN products p ON p.id = ii.product_id
           WHERE i.status = 'final'
             AND i.inward_date = ?
             AND lower(trim(ii.metal)) = lower(trim(?))
             AND lower(trim(ii.category)) = lower(trim(?))
           ORDER BY i.id, ii.id`,
        )
        .all(stockDate, metal, itemName) as Array<{
        documentId: number
        documentNo: string
        documentDate: string
        productName: string | null
        qty: number
        netWeight: number
        weightTotal: number
      }>
      lines = rows.map((row) => ({ kind: 'inward' as const, ...row }))
    } else {
      const rows = db
        .prepare(
          `SELECT i.id AS documentId, i.invoice_no AS documentNo, i.invoice_date AS documentDate,
                  COALESCE(NULLIF(ii.description, ''), p.name) AS productName,
                  ii.qty, ii.net_weight AS netWeight,
                  (ii.net_weight * ii.qty) AS weightTotal
           FROM invoice_items ii
           JOIN invoices i ON i.id = ii.invoice_id
           LEFT JOIN products p ON p.id = ii.product_id
           WHERE i.status = 'final'
             AND i.is_estimate = 0
             AND i.is_historical = 0
             AND i.invoice_date = ?
             AND COALESCE(ii.line_kind, 'sale') = 'sale'
             AND lower(trim(ii.metal)) = lower(trim(?))
             AND lower(trim(ii.category)) = lower(trim(?))
           ORDER BY i.id, ii.id`,
        )
        .all(stockDate, metal, itemName) as Array<{
        documentId: number
        documentNo: string
        documentDate: string
        productName: string | null
        qty: number
        netWeight: number
        weightTotal: number
      }>
      lines = rows.map((row) => ({ kind: 'sales' as const, ...row }))
    }

    res.json(lines)
  }),
)

router.get(
  '/day-closings',
  asyncHandler((req, res) => {
    const { businessDate, metal } = parseBody(metalDayClosingGetSchema, {
      businessDate: req.query.businessDate,
      metal: req.query.metal,
    })
    res.json(buildDaySheet(businessDate, metal))
  }),
)

router.get(
  '/day-closings/history',
  asyncHandler((req, res) => {
    const metal =
      typeof req.query.metal === 'string' && req.query.metal
        ? parseBody(stockHistorySchema, { metal: req.query.metal }).metal
        : null
    const db = getDatabase()
    const rows = metal
      ? (db
          .prepare(
            `SELECT business_date, metal, status, operator_name, closed_at
             FROM metal_day_closings
             WHERE metal = ? AND status = 'closed'
             ORDER BY business_date DESC
             LIMIT ?`,
          )
          .all(metal, HISTORY_LIMIT) as Array<{
          business_date: string
          metal: string
          status: 'closed'
          operator_name: string
          closed_at: string | null
        }>)
      : (db
          .prepare(
            `SELECT business_date, metal, status, operator_name, closed_at
             FROM metal_day_closings
             WHERE status = 'closed'
             ORDER BY business_date DESC, metal
             LIMIT ?`,
          )
          .all(HISTORY_LIMIT) as Array<{
          business_date: string
          metal: string
          status: 'closed'
          operator_name: string
          closed_at: string | null
        }>)

    const history: MetalDayClosingHistoryRow[] = rows.map((row) => {
      const totals = sumRows(listRowsForMetal(row.business_date, row.metal))
      return {
        businessDate: row.business_date,
        metal: row.metal,
        status: row.status,
        operatorName: row.operator_name,
        closedAt: row.closed_at,
        ...totals,
      }
    })
    res.json(history)
  }),
)

router.get(
  '/day-closings/precheck',
  asyncHandler((req, res) => {
    const { businessDate, metal } = parseBody(metalDayClosingGetSchema, {
      businessDate: req.query.businessDate,
      metal: req.query.metal,
    })
    res.json(buildDayClosePrecheck(businessDate, metal))
  }),
)

router.get(
  '/reconciliation',
  asyncHandler((req, res) => {
    const { date } = parseBody(stockReconciliationSchema, { date: req.query.date })
    res.json(buildReconciliation(date))
  }),
)

router.get(
  '/categories',
  asyncHandler((_req, res) => {
    res.json(listCategoryRows(getDatabase()).map(mapCategory))
  }),
)

router.post(
  '/day-closings/close',
  asyncHandler((req, res) => {
    const input = parseBody(metalDayCloseSchema, req.body) as MetalDayCloseInput
    const db = getDatabase()
    if (isMetalDayClosed(db, input.businessDate, input.metal)) {
      throw new Error('This metal day is already closed')
    }
    assertDayCloseable(input.businessDate, input.metal)
    const liveRows = categoryNames().map((itemName) =>
      buildLiveRow(input.businessDate, input.metal, itemName),
    )
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO metal_day_closings (
           business_date, metal, status, operator_name, note, closed_at, updated_at
         ) VALUES (?, ?, 'closed', ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(business_date, metal) DO UPDATE SET
           status = 'closed',
           operator_name = excluded.operator_name,
           note = excluded.note,
           closed_at = datetime('now'),
           updated_at = datetime('now')`,
      ).run(input.businessDate, input.metal, input.operatorName, input.note ?? '')

      db.prepare(
        `DELETE FROM metal_day_closing_lines WHERE business_date = ? AND metal = ?`,
      ).run(input.businessDate, input.metal)

      const insert = db.prepare(
        `INSERT INTO metal_day_closing_lines (
           business_date, metal, item_name, opening_weight, inward_weight, sales_weight,
           exchange_weight, closing_weight, sales_override
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of liveRows) {
        insert.run(
          input.businessDate,
          input.metal,
          row.itemName,
          row.openingWeight,
          row.autoPurchaseIn,
          row.effectiveSales,
          row.autoExchangeIn,
          row.closingWeight,
          row.salesOverride,
        )
      }
    })
    tx()
    res.json(buildDaySheet(input.businessDate, input.metal))
  }),
)

router.post(
  '/day-closings/reopen',
  requireRole('admin'),
  asyncHandler((req, res) => {
    const input = parseBody(metalDayReopenSchema, req.body) as MetalDayReopenInput
    const db = getDatabase()
    if (!isMetalDayClosed(db, input.businessDate, input.metal)) {
      throw new Error('This metal day is not closed')
    }
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE metal_day_closings
         SET status = 'open',
             reopen_reason = ?,
             reopened_by = ?,
             reopened_at = datetime('now'),
             updated_at = datetime('now')
         WHERE business_date = ? AND metal = ?`,
      ).run(input.reason, req.user?.username ?? '', input.businessDate, input.metal)
      db.prepare(
        `DELETE FROM metal_day_closing_lines WHERE business_date = ? AND metal = ?`,
      ).run(input.businessDate, input.metal)
    })
    tx()
    res.json(buildDaySheet(input.businessDate, input.metal))
  }),
)

router.post(
  '/categories',
  asyncHandler((req, res) => {
    const input = parseBody(stockCategoryCreateSchema, req.body) as StockCategoryCreateInput
    const db = getDatabase()
    if (findCategoryByName(db, input.name)) {
      throw new Error('A category with this name already exists')
    }
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM stock_categories')
      .get() as { max_order: number }
    const result = db
      .prepare('INSERT INTO stock_categories (name, sort_order) VALUES (?, ?)')
      .run(input.name, maxOrder.max_order + 1)
    if (input.openingWeight !== undefined && input.stockDate !== undefined && input.metal !== undefined) {
      persistStockDay({
        stockDate: input.stockDate,
        metal: input.metal,
        itemName: input.name,
        openingWeight: input.openingWeight,
      })
    }
    const row = db
      .prepare('SELECT id, name, sort_order FROM stock_categories WHERE id = ?')
      .get(result.lastInsertRowid) as CategoryRow
    res.status(201).json(mapCategory(row))
  }),
)

router.put(
  '/categories',
  asyncHandler((req, res) => {
    const input = parseBody(stockCategoryUpdateSchema, req.body) as StockCategoryUpdateInput
    const db = getDatabase()
    const current = requireCategory(db, input.currentName)
    if (input.currentName.toLowerCase() !== input.newName.toLowerCase()) {
      const clash = findCategoryByName(db, input.newName)
      if (clash) {
        throw new Error('A category with this name already exists')
      }
    }
    const tx = db.transaction(() => {
      db.prepare('UPDATE stock_categories SET name = ? WHERE id = ?').run(input.newName, current.id)
      db.prepare(
        "UPDATE item_stock_days SET item_name = ?, updated_at = datetime('now') WHERE item_name = ?",
      ).run(input.newName, current.name)
      db.prepare(
        `UPDATE metal_day_closing_lines SET item_name = ? WHERE item_name = ?`,
      ).run(input.newName, current.name)
      db.prepare(`UPDATE products SET category = ? WHERE category = ?`).run(input.newName, current.name)
      db.prepare(`UPDATE invoice_items SET category = ? WHERE category = ?`).run(
        input.newName,
        current.name,
      )
      db.prepare(`UPDATE inward_items SET category = ? WHERE category = ?`).run(
        input.newName,
        current.name,
      )
    })
    tx()
    const updated = db
      .prepare('SELECT id, name, sort_order FROM stock_categories WHERE id = ?')
      .get(current.id) as CategoryRow
    res.json(mapCategory(updated))
  }),
)

router.delete(
  '/categories',
  asyncHandler((req, res) => {
    const { name } = parseBody(stockCategoryDeleteSchema, req.body)
    const db = getDatabase()
    const category = requireCategory(db, name)
    const productCount = (
      db.prepare(`SELECT COUNT(*) AS count FROM products WHERE category = ?`).get(category.name) as {
        count: number
      }
    ).count
    const billCount = (
      db
        .prepare(`SELECT COUNT(*) AS count FROM invoice_items WHERE category = ?`)
        .get(category.name) as { count: number }
    ).count
    const inwardCount = (
      db
        .prepare(`SELECT COUNT(*) AS count FROM inward_items WHERE category = ?`)
        .get(category.name) as { count: number }
    ).count
    if (productCount + billCount + inwardCount > 0) {
      throw new Error(
        `Category is in use by ${productCount} products / ${billCount} bill lines / ${inwardCount} inward lines and cannot be deleted`,
      )
    }
    db.prepare('DELETE FROM item_stock_days WHERE item_name = ?').run(category.name)
    db.prepare('DELETE FROM metal_day_closing_lines WHERE item_name = ?').run(category.name)
    db.prepare('DELETE FROM stock_categories WHERE id = ?').run(category.id)
    res.status(204).end()
  }),
)

export default router
