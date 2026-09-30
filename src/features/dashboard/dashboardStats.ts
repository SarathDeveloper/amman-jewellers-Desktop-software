import type { DueEntry, DuesLedger, Invoice, ItemStockRow } from '@shared/types'
import { dateInRange, monthRange } from '../invoices/billingInsights'

export const RECENT_BILLS_LIMIT = 3
export const DUE_COLLECTIONS_LIMIT = 3

/** Shop counter hours shown on the sales overview chart (inclusive start, exclusive end + 1 for labels). */
export const SALES_CHART_START_HOUR = 9
export const SALES_CHART_END_HOUR = 20

export type DashboardPeriod = 'today' | 'week' | 'month' | 'year' | 'custom'
export type ChartGranularity = 'hour' | 'day' | 'month'

export interface DashboardStatsOptions {
  period?: DashboardPeriod
  customFrom?: string
  customTo?: string
}

export interface SalesChartBucket {
  key: string
  label: string
  total: number
}

export interface SalesOverview {
  hourlyTotals: number[]
  chartBuckets: SalesChartBucket[]
  chartGranularity: ChartGranularity
  billsGenerated: number
  averageBillValue: number
  customersBilled: number
  totalItemsSold: number
}

export interface MetalStockSummary {
  opening: number
  inward: number
  sold: number
  closing: number
}

export interface DueCollectionRow {
  customerId: number
  customerName: string
  balance: number
  daysOverdue: number
}

export interface DashboardStats {
  todaySales: number
  todayCollections: number
  totalOutstanding: number
  draftCount: number
  goldClosing: number
  silverClosing: number
  recentBills: Invoice[]
  salesOverview: SalesOverview
  metalStock: {
    gold: MetalStockSummary
    silver: MetalStockSummary
  }
  dueCollections: DueCollectionRow[]
  outstandingCustomerCount: number
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDateKey(value: string): string {
  return value.slice(0, 10)
}

function parseLocalDate(iso: string): Date {
  const [year, month, day] = toDateKey(iso).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(iso: string, days: number): string {
  const date = parseLocalDate(iso)
  date.setDate(date.getDate() + days)
  return formatLocalDate(date)
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = []
  let cursor = toDateKey(from)
  const end = toDateKey(to)
  while (cursor <= end) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

function eachMonth(from: string, to: string): string[] {
  const months: string[] = []
  let year = Number(toDateKey(from).slice(0, 4))
  let month = Number(toDateKey(from).slice(5, 7))
  const endYear = Number(toDateKey(to).slice(0, 4))
  const endMonth = Number(toDateKey(to).slice(5, 7))
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

function formatHourLabel(hour: number): string {
  if (hour === 12) return '12 PM'
  if (hour < 12) return `${hour} AM`
  return `${hour - 12} PM`
}

function formatDayLabel(iso: string, style: 'weekday' | 'day' | 'short'): string {
  const date = parseLocalDate(iso)
  if (style === 'weekday') return WEEKDAY_LABELS[date.getDay()]
  if (style === 'day') return String(date.getDate())
  return `${date.getDate()} ${MONTH_LABELS[date.getMonth()]}`
}

function formatMonthLabel(yearMonth: string, showYear: boolean): string {
  const month = Number(yearMonth.slice(5, 7))
  const year = yearMonth.slice(0, 4)
  const name = MONTH_LABELS[month - 1] ?? yearMonth
  return showYear ? `${name} ${year.slice(2)}` : name
}

function isFinalSale(invoice: Invoice): boolean {
  return invoice.status === 'final' && !invoice.isEstimate && !invoice.isHistorical
}

export function weekBounds(today: string): { from: string; to: string } {
  const date = parseLocalDate(today)
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(date)
  monday.setDate(date.getDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: formatLocalDate(monday), to: formatLocalDate(sunday) }
}

export function weekRange(today: string): { from: string; to: string } {
  const bounds = weekBounds(today)
  return { from: bounds.from, to: bounds.to > today ? today : bounds.to }
}

export function yearRange(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 4)}-01-01`, to: today }
}

export function clampCustomRange(from: string, to: string): { from: string; to: string } {
  const start = toDateKey(from)
  const end = toDateKey(to)
  return start <= end ? { from: start, to: end } : { from: end, to: start }
}

export function resolvePeriodRange(
  period: DashboardPeriod,
  today: string,
  customFrom?: string,
  customTo?: string,
): { from: string; to: string } {
  if (period === 'today') return { from: today, to: today }
  if (period === 'week') return weekRange(today)
  if (period === 'month') {
    const month = monthRange(today)
    return { from: month.from, to: month.to > today ? today : month.to }
  }
  if (period === 'year') return yearRange(today)
  return clampCustomRange(customFrom ?? today, customTo ?? today)
}

export function periodGranularity(
  period: DashboardPeriod,
  range: { from: string; to: string }
): ChartGranularity {
  if (period === 'today') return 'hour'
  if (period === 'year') return 'month'
  if (period === 'custom') {
    return daysBetween(range.from, range.to) + 1 > 31 ? 'month' : 'day'
  }
  return 'day'
}

function buildChartBuckets(
  period: DashboardPeriod,
  range: { from: string; to: string },
  granularity: ChartGranularity,
  today: string,
): SalesChartBucket[] {
  if (granularity === 'hour') {
    const hours = Array.from(
      { length: SALES_CHART_END_HOUR - SALES_CHART_START_HOUR + 1 },
      (_, i) => SALES_CHART_START_HOUR + i,
    )
    return hours.map((hour) => ({
      key: String(hour),
      label: formatHourLabel(hour),
      total: 0,
    }))
  }

  if (granularity === 'month') {
    const months = eachMonth(range.from, range.to)
    const showYear = months[0]?.slice(0, 4) !== months[months.length - 1]?.slice(0, 4)
    return months.map((yearMonth) => ({
      key: yearMonth,
      label: formatMonthLabel(yearMonth, showYear),
      total: 0,
    }))
  }

  const dayRange = period === 'week' ? weekBounds(today) : range
  const style = period === 'week' ? 'weekday' : period === 'month' ? 'day' : 'short'
  return eachDay(dayRange.from, dayRange.to).map((iso) => ({
    key: iso,
    label: formatDayLabel(iso, style),
    total: 0,
  }))
}

function sumClosingWeight(rows: ItemStockRow[] | null | undefined): number {
  if (!rows?.length) {
    return 0
  }
  return rows.reduce((sum, row) => sum + row.closingWeight, 0)
}

export function sumMetalStock(rows: ItemStockRow[] | null | undefined): MetalStockSummary {
  if (!rows?.length) {
    return { opening: 0, inward: 0, sold: 0, closing: 0 }
  }
  return rows.reduce(
    (acc, row) => ({
      opening: acc.opening + row.openingWeight,
      inward: acc.inward + row.autoPurchaseIn,
      sold: acc.sold + row.effectiveSales,
      closing: acc.closing + row.closingWeight,
    }),
    { opening: 0, inward: 0, sold: 0, closing: 0 }
  )
}

function computePeriodSales(invoices: Invoice[], from: string, to: string): number {
  let total = 0
  for (const invoice of invoices) {
    if (isFinalSale(invoice) && dateInRange(invoice.invoiceDate, from, to)) {
      total += invoice.total
    }
  }
  return total
}

export function computePeriodCollections(
  invoices: Invoice[],
  entries: DueEntry[],
  from: string,
  to: string,
): number {
  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]))
  let total = 0

  for (const invoice of invoices) {
    if (isFinalSale(invoice) && dateInRange(invoice.invoiceDate, from, to)) {
      total += invoice.amountPaid
    }
  }

  for (const entry of entries) {
    if (entry.kind !== 'payment' || !dateInRange(entry.entryDate, from, to)) {
      continue
    }
    if (entry.invoiceId === null) {
      total += entry.amount
      continue
    }
    const linked = invoiceById.get(entry.invoiceId)
    if (!linked || toDateKey(linked.invoiceDate) < toDateKey(entry.entryDate)) {
      total += entry.amount
    }
  }

  return total
}

export function computeTodayCollections(
  invoices: Invoice[],
  entries: DueEntry[],
  today: string,
): number {
  return computePeriodCollections(invoices, entries, today, today)
}

function computeSalesOverview(
  invoices: Invoice[],
  range: { from: string; to: string },
  period: DashboardPeriod,
  today: string,
): SalesOverview {
  const granularity = periodGranularity(period, range)
  const chartBuckets = buildChartBuckets(period, range, granularity, today)
  const indexByKey = new Map(chartBuckets.map((bucket, index) => [bucket.key, index]))

  const inRange: Invoice[] = []
  for (const invoice of invoices) {
    if (!isFinalSale(invoice) || !dateInRange(invoice.invoiceDate, range.from, range.to)) {
      continue
    }
    inRange.push(invoice)

    let key: string | null = null
    if (granularity === 'hour') {
      const hour = new Date(invoice.createdAt).getHours()
      if (hour >= SALES_CHART_START_HOUR && hour <= SALES_CHART_END_HOUR) {
        key = String(hour)
      }
    } else if (granularity === 'day') {
      key = toDateKey(invoice.invoiceDate)
    } else {
      key = toDateKey(invoice.invoiceDate).slice(0, 7)
    }

    if (key === null) continue
    const index = indexByKey.get(key)
    if (index !== undefined) {
      chartBuckets[index].total += invoice.total
    }
  }

  const billsGenerated = inRange.length
  const periodSales = inRange.reduce((sum, inv) => sum + inv.total, 0)
  const averageBillValue = billsGenerated > 0 ? periodSales / billsGenerated : 0
  const customersBilled = new Set(inRange.map((inv) => inv.customerId)).size
  const totalItemsSold = inRange.reduce(
    (sum, inv) => sum + inv.items.reduce((itemSum, item) => itemSum + item.qty, 0),
    0,
  )

  return {
    hourlyTotals: chartBuckets.map((bucket) => bucket.total),
    chartBuckets,
    chartGranularity: granularity,
    billsGenerated,
    averageBillValue,
    customersBilled,
    totalItemsSold,
  }
}

export function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${toDateKey(startDate)}T12:00:00`)
  const end = new Date(`${toDateKey(endDate)}T12:00:00`)
  const diffMs = end.getTime() - start.getTime()
  return Math.max(0, Math.floor(diffMs / 86_400_000))
}

export function oldestDueDate(entries: DueEntry[]): string | null {
  let oldest: string | null = null
  for (const entry of entries) {
    if (entry.kind !== 'due') {
      continue
    }
    const key = toDateKey(entry.entryDate)
    if (!oldest || key < oldest) {
      oldest = key
    }
  }
  return oldest
}

function computeDueCollections(
  ledger: DuesLedger | null | undefined,
  today: string,
): {
  dueCollections: DueCollectionRow[]
  outstandingCustomerCount: number
} {
  const withBalance = (ledger?.columns ?? [])
    .filter((column) => column.balance > 0)
    .map((column) => {
      const oldest = oldestDueDate(column.entries ?? [])
      return {
        customerId: column.customerId,
        customerName: column.customerName,
        balance: column.balance,
        daysOverdue: oldest ? daysBetween(oldest, today) : 0,
      }
    })
    .sort((a, b) => b.balance - a.balance)

  return {
    dueCollections: withBalance.slice(0, DUE_COLLECTIONS_LIMIT),
    outstandingCustomerCount: withBalance.length,
  }
}

export function computeDashboardStats(
  invoices: Invoice[] | null | undefined,
  ledger: DuesLedger | null | undefined,
  goldStock: ItemStockRow[] | null | undefined,
  silverStock: ItemStockRow[] | null | undefined,
  today: string,
  options: DashboardStatsOptions = {}
): DashboardStats {
  const invoiceList = invoices ?? []
  const period = options.period ?? 'today'
  const range = resolvePeriodRange(period, today, options.customFrom, options.customTo)
  let draftCount = 0
  for (const invoice of invoiceList) {
    if (invoice.status === 'draft') {
      draftCount += 1
    }
  }

  const allEntries = (ledger?.columns ?? []).flatMap((column) => column.entries ?? [])
  const { dueCollections, outstandingCustomerCount } = computeDueCollections(ledger, today)

  return {
    todaySales: computePeriodSales(invoiceList, range.from, range.to),
    todayCollections: computePeriodCollections(invoiceList, allEntries, range.from, range.to),
    totalOutstanding: ledger?.totalOutstanding ?? 0,
    draftCount,
    goldClosing: sumClosingWeight(goldStock),
    silverClosing: sumClosingWeight(silverStock),
    recentBills: invoiceList.slice(0, RECENT_BILLS_LIMIT),
    salesOverview: computeSalesOverview(invoiceList, range, period, today),
    metalStock: {
      gold: sumMetalStock(goldStock),
      silver: sumMetalStock(silverStock),
    },
    dueCollections,
    outstandingCustomerCount,
  }
}
