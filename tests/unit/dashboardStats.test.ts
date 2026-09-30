import { describe, expect, it } from 'vitest'
import {
  clampCustomRange,
  computeDashboardStats,
  periodGranularity,
  resolvePeriodRange,
  weekBounds,
  weekRange,
  yearRange,
} from '../../src/features/dashboard/dashboardStats'
import type { DueEntry, DuesLedger, Invoice, ItemStockRow } from '../../shared/types'

const today = '2026-09-24'
const yesterday = '2026-09-23'

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    customerId: 1,
    customerName: 'Test',
    invoiceNo: 'CB-1',
    invoiceDate: today,
    subtotal: 1000,
    tax: 0,
    total: 1000,
    status: 'final',
    items: [],
    createdAt: `${today}T10:00:00`,
    billFormat: 'cash_bill',
    paymentMode: 'cash',
    amountPaid: 1000,
    balanceDue: 0,
    discount: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    isEstimate: false,
    isHistorical: false,
    customerPhone: '',
    summaryGoldG: 0,
    summarySilverG: 0,
    summaryMaking: 0,
    oldGold: [],
    oldGoldLinks: [],
    roundOff: 0,
    amountPayable: 1000,
    payments: [],
    ...overrides,
  }
}

function stockRow(closingWeight: number): ItemStockRow {
  return {
    itemName: 'Chain',
    openingWeight: 100,
    autoPurchaseIn: 0,
    autoSales: 0,
    autoExchangeIn: 0,
    salesOverride: null,
    overrideReason: '',
    overrideReferenceId: null,
    effectiveSales: 0,
    closingWeight,
  }
}

function paymentEntry(overrides: Partial<DueEntry> = {}): DueEntry {
  return {
    id: 1,
    customerId: 1,
    entryDate: today,
    kind: 'payment',
    amount: 500,
    note: '',
    invoiceId: null,
    invoiceNo: null,
    pledgeId: null,
    pledgeReceiptNo: null,
    createdAt: '',
    invoiceTotal: null,
    amountPaid: null,
    balanceDue: null,
    items: [],
    ...overrides,
  }
}

describe('computeDashboardStats', () => {
  const emptyLedger: DuesLedger = { columns: [], totalOutstanding: 0 }

  it('sums today sales from final non-estimate bills', () => {
    const invoices = [
      baseInvoice({ id: 1, total: 1000 }),
      baseInvoice({ id: 2, total: 2500, invoiceDate: yesterday }),
      baseInvoice({ id: 3, total: 800, status: 'draft' }),
      baseInvoice({ id: 4, total: 300, isEstimate: true }),
      baseInvoice({ id: 5, total: 900, isHistorical: true }),
    ]
    const stats = computeDashboardStats(invoices, emptyLedger, [], [], today)
    expect(stats.todaySales).toBe(1000)
  })

  it('counts drafts and outstanding', () => {
    const invoices = [
      baseInvoice({ status: 'draft' }),
      baseInvoice({ id: 2, status: 'draft' }),
    ]
    const ledger: DuesLedger = { columns: [], totalOutstanding: 4200 }
    const stats = computeDashboardStats(invoices, ledger, [], [], today)
    expect(stats.draftCount).toBe(2)
    expect(stats.totalOutstanding).toBe(4200)
  })

  it('sums collections from today bills without double-counting same-day ledger payments', () => {
    const invoices = [
      baseInvoice({
        id: 10,
        total: 5000,
        amountPaid: 2000,
        balanceDue: 3000,
      }),
    ]
    const ledger: DuesLedger = {
      totalOutstanding: 3000,
      columns: [
        {
          customerId: 1,
          customerName: 'Test',
          customerPhone: '',
          balance: 3000,
          entries: [
            paymentEntry({
              invoiceId: 10,
              amount: 2000,
              entryDate: today,
            }),
          ],
        },
      ],
    }
    const stats = computeDashboardStats(invoices, ledger, [], [], today)
    expect(stats.todayCollections).toBe(2000)
  })

  it('includes follow-up payments on older bills', () => {
    const invoices = [
      baseInvoice({
        id: 20,
        invoiceDate: yesterday,
        total: 5000,
        amountPaid: 2000,
        balanceDue: 3000,
      }),
    ]
    const ledger: DuesLedger = {
      totalOutstanding: 2500,
      columns: [
        {
          customerId: 1,
          customerName: 'Test',
          customerPhone: '',
          balance: 2500,
          entries: [
            paymentEntry({
              invoiceId: 20,
              amount: 500,
              entryDate: today,
            }),
          ],
        },
      ],
    }
    const stats = computeDashboardStats(invoices, ledger, [], [], today)
    expect(stats.todayCollections).toBe(500)
  })

  it('sums gold and silver closing weights', () => {
    const stats = computeDashboardStats(
      [],
      emptyLedger,
      [stockRow(10.5), stockRow(2.25)],
      [stockRow(100)],
      today,
    )
    expect(stats.goldClosing).toBe(12.75)
    expect(stats.silverClosing).toBe(100)
  })

  it('returns up to three recent bills in list order', () => {
    const invoices = Array.from({ length: 10 }, (_, i) =>
      baseInvoice({ id: i + 1, invoiceNo: `CB-${i + 1}`, createdAt: `${today}T${i}:00:00` }),
    )
    const stats = computeDashboardStats(invoices, emptyLedger, [], [], today)
    expect(stats.recentBills).toHaveLength(3)
    expect(stats.recentBills[0].id).toBe(1)
    expect(stats.recentBills[2].id).toBe(3)
  })

  it('aggregates sales overview and metal stock', () => {
    const invoices = [
      baseInvoice({
        id: 1,
        total: 2000,
        customerId: 1,
        createdAt: `${today}T10:30:00`,
        items: [
          {
            id: 1,
            invoiceId: 1,
            productId: 1,
            productName: 'Ring',
            qty: 2,
            rate: 1000,
            lineTotal: 2000,
            grossWeight: 0,
            netWeight: 0,
            stoneWeight: 0,
            metalRate: 0,
            makingCharges: 0,
            wastagePct: 0,
            stoneRate: 0,
            otherCharges: 0,
            lineSubtotal: 2000,
          },
        ],
      }),
      baseInvoice({
        id: 2,
        total: 1000,
        customerId: 2,
        createdAt: `${today}T11:00:00`,
        items: [
          {
            id: 2,
            invoiceId: 2,
            productId: 2,
            productName: 'Chain',
            qty: 1,
            rate: 1000,
            lineTotal: 1000,
            grossWeight: 0,
            netWeight: 0,
            stoneWeight: 0,
            metalRate: 0,
            makingCharges: 0,
            wastagePct: 0,
            stoneRate: 0,
            otherCharges: 0,
            lineSubtotal: 1000,
          },
        ],
      }),
    ]
    const goldRows = [
      {
        itemName: 'Chain',
        openingWeight: 100,
        autoPurchaseIn: 0,
        autoSales: 5,
        autoExchangeIn: 0,
        salesOverride: null,
        overrideReason: '',
        overrideReferenceId: null,
        effectiveSales: 5,
        closingWeight: 95,
      },
    ]
    const ledger: DuesLedger = {
      totalOutstanding: 1500,
      columns: [
        {
          customerId: 3,
          customerName: 'Ravi',
          customerPhone: '',
          balance: 1500,
          entries: [],
        },
        {
          customerId: 4,
          customerName: 'Priya',
          customerPhone: '',
          balance: 0,
          entries: [],
        },
      ],
    }
    const stats = computeDashboardStats(invoices, ledger, goldRows, [], today)
    expect(stats.salesOverview.billsGenerated).toBe(2)
    expect(stats.salesOverview.averageBillValue).toBe(1500)
    expect(stats.salesOverview.customersBilled).toBe(2)
    expect(stats.salesOverview.totalItemsSold).toBe(3)
    expect(stats.salesOverview.hourlyTotals[1]).toBe(2000)
    expect(stats.salesOverview.hourlyTotals[2]).toBe(1000)
    expect(stats.metalStock.gold.opening).toBe(100)
    expect(stats.metalStock.gold.sold).toBe(5)
    expect(stats.metalStock.gold.closing).toBe(95)
    expect(stats.dueCollections).toHaveLength(1)
    expect(stats.dueCollections[0].customerName).toBe('Ravi')
    expect(stats.dueCollections[0].daysOverdue).toBe(0)
    expect(stats.outstandingCustomerCount).toBe(1)
  })

  it('computes days overdue from oldest due entry', () => {
    const ledger: DuesLedger = {
      totalOutstanding: 15000,
      columns: [
        {
          customerId: 1,
          customerName: 'Ravi Kumar',
          customerPhone: '',
          balance: 15000,
          entries: [
            {
              id: 1,
              customerId: 1,
              entryDate: '2026-09-12',
              kind: 'due',
              amount: 15000,
              note: '',
              invoiceId: 1,
              invoiceNo: 'JTP-2026-0001',
              createdAt: '',
              invoiceTotal: 15000,
              amountPaid: 0,
              balanceDue: 15000,
              items: [],
            },
          ],
        },
      ],
    }
    const stats = computeDashboardStats([], ledger, [], [], today)
    expect(stats.dueCollections[0].daysOverdue).toBe(12)
  })

  it('resolves week, month, year, and swapped custom ranges', () => {
    expect(weekBounds(today)).toEqual({ from: '2026-09-21', to: '2026-09-27' })
    expect(weekRange(today)).toEqual({ from: '2026-09-21', to: today })
    expect(resolvePeriodRange('month', today)).toEqual({ from: '2026-09-01', to: today })
    expect(yearRange(today)).toEqual({ from: '2026-01-01', to: today })
    expect(clampCustomRange('2026-09-20', '2026-09-10')).toEqual({
      from: '2026-09-10',
      to: '2026-09-20',
    })
    expect(periodGranularity('custom', { from: '2026-08-16', to: today })).toBe('month')
    expect(periodGranularity('custom', { from: '2026-09-15', to: today })).toBe('day')
  })

  it('sums sales and collections across a multi-day range', () => {
    const invoices = [
      baseInvoice({
        id: 1,
        invoiceDate: yesterday,
        createdAt: `${yesterday}T11:00:00`,
        total: 4000,
        amountPaid: 2000,
        balanceDue: 2000,
      }),
      baseInvoice({
        id: 2,
        total: 1500,
        amountPaid: 1500,
      }),
      baseInvoice({
        id: 3,
        invoiceDate: '2026-09-01',
        createdAt: '2026-09-01T10:00:00',
        total: 900,
        amountPaid: 900,
      }),
      baseInvoice({
        id: 4,
        total: 300,
        isEstimate: true,
      }),
    ]
    const ledger: DuesLedger = {
      totalOutstanding: 2000,
      columns: [
        {
          customerId: 1,
          customerName: 'Test',
          customerPhone: '',
          balance: 2000,
          entries: [
            paymentEntry({
              invoiceId: 1,
              amount: 500,
              entryDate: today,
            }),
          ],
        },
      ],
    }
    const week = computeDashboardStats(invoices, ledger, [], [], today, { period: 'week' })
    expect(week.todaySales).toBe(5500)
    expect(week.todayCollections).toBe(4000)
    expect(week.salesOverview.billsGenerated).toBe(2)
    expect(week.salesOverview.chartBuckets).toHaveLength(7)
    expect(week.salesOverview.chartBuckets[0].key).toBe('2026-09-21')
    expect(week.salesOverview.chartBuckets[2].total).toBe(4000)
    expect(week.salesOverview.chartBuckets[3].total).toBe(1500)

    const month = computeDashboardStats(invoices, ledger, [], [], today, { period: 'month' })
    expect(month.todaySales).toBe(6400)
    expect(month.salesOverview.chartBuckets).toHaveLength(24)
    expect(month.salesOverview.chartBuckets[0].key).toBe('2026-09-01')
    expect(month.salesOverview.chartBuckets[0].total).toBe(900)

    const year = computeDashboardStats(invoices, ledger, [], [], today, { period: 'year' })
    expect(year.salesOverview.chartGranularity).toBe('month')
    expect(year.salesOverview.chartBuckets).toHaveLength(9)
    expect(year.salesOverview.chartBuckets[8].key).toBe('2026-09')
    expect(year.salesOverview.chartBuckets[8].total).toBe(6400)
  })

  it('uses daily or monthly custom buckets from the selected dates', () => {
    const invoices = [
      baseInvoice({
        id: 1,
        invoiceDate: '2026-08-20',
        createdAt: '2026-08-20T10:00:00',
        total: 1200,
      }),
      baseInvoice({
        id: 2,
        invoiceDate: '2026-09-15',
        createdAt: '2026-09-15T10:00:00',
        total: 800,
      }),
    ]
    const daily = computeDashboardStats(invoices, emptyLedger, [], [], today, {
      period: 'custom',
      customFrom: '2026-09-15',
      customTo: today,
    })
    expect(daily.salesOverview.chartGranularity).toBe('day')
    expect(daily.salesOverview.chartBuckets).toHaveLength(10)
    expect(daily.todaySales).toBe(800)
    expect(daily.salesOverview.chartBuckets[0].total).toBe(800)

    const monthly = computeDashboardStats(invoices, emptyLedger, [], [], today, {
      period: 'custom',
      customFrom: '2026-08-16',
      customTo: today,
    })
    expect(monthly.salesOverview.chartGranularity).toBe('month')
    expect(monthly.salesOverview.chartBuckets.map((bucket) => bucket.key)).toEqual([
      '2026-08',
      '2026-09',
    ])
    expect(monthly.todaySales).toBe(2000)
    expect(monthly.salesOverview.chartBuckets[0].total).toBe(1200)
    expect(monthly.salesOverview.chartBuckets[1].total).toBe(800)
  })
})
