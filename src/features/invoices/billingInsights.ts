import type { DueEntry, Invoice, PaymentMode } from '@shared/types'

export type BillingPeriod = 'today' | 'month' | 'all'
export type StatusFilter = 'all' | 'draft' | 'due' | 'paid' | 'estimate' | 'final'
export type DuePaidFilter = 'all' | 'due' | 'paid'
export type ListChip = 'all' | 'cash_bill' | 'tax_invoice' | 'draft' | 'estimate' | 'final'

export interface BillingDaySummary {
  sales: number
  collections: number
  billsGenerated: number
  paymentsReceived: number
  totalBills: number
  finalCount: number
  draftCount: number
  estimateCount: number
}

export interface BillingInsights {
  sales: number
  collected: number
  stillDue: number
  billCount: number
  averageBill: number
  cash: number
  upi: number
  card: number
  mixed: number
  cashBillSales: number
  taxInvoiceSales: number
  goldGrams: number
  silverGrams: number
  makingCharges: number
}

export function monthRange(today: string): { from: string; to: string } {
  const [year, month] = today.split('-')
  const lastDay = new Date(Number(year), Number(month), 0).getDate()
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function dateInRange(value: string, from: string, to: string): boolean {
  const key = value.slice(0, 10)
  return key >= from && key <= to
}

function countsTowardSales(invoice: Invoice): boolean {
  return invoice.status === 'final' && !invoice.isEstimate
}

function addMetal(invoice: Invoice, insights: BillingInsights): void {
  if (invoice.items.length === 0) {
    insights.goldGrams += invoice.summaryGoldG
    insights.silverGrams += invoice.summarySilverG
    insights.makingCharges += invoice.summaryMaking
    return
  }

  for (const item of invoice.items) {
    const weight = item.netWeight * item.qty
    const metal = (item.metal ?? '').toLowerCase()
    if (metal.includes('silver')) {
      insights.silverGrams += weight
    } else if (metal.includes('gold')) {
      insights.goldGrams += weight
    }
    insights.makingCharges += item.makingCharges * item.qty
  }
}

function toDateKey(value: string): string {
  return value.slice(0, 10)
}

function isFinalSale(invoice: Invoice): boolean {
  return invoice.status === 'final' && !invoice.isEstimate && !invoice.isHistorical
}

export function computeBillingDaySummary(
  invoices: Invoice[],
  entries: DueEntry[],
  day: string,
): BillingDaySummary {
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  const summary: BillingDaySummary = {
    sales: 0,
    collections: 0,
    billsGenerated: 0,
    paymentsReceived: 0,
    totalBills: 0,
    finalCount: 0,
    draftCount: 0,
    estimateCount: 0,
  }

  for (const invoice of invoices) {
    if (toDateKey(invoice.invoiceDate) !== day) {
      continue
    }
    summary.totalBills += 1
    summary.billsGenerated += 1
    if (invoice.isEstimate) {
      summary.estimateCount += 1
    } else if (invoice.status === 'draft') {
      summary.draftCount += 1
    } else {
      summary.finalCount += 1
    }
    if (isFinalSale(invoice)) {
      summary.sales += invoice.total
      summary.collections += invoice.amountPaid
      if (invoice.amountPaid > 0) {
        summary.paymentsReceived += 1
      }
    }
  }

  for (const entry of entries) {
    if (entry.kind !== 'payment' || toDateKey(entry.entryDate) !== day) {
      continue
    }
    if (entry.invoiceId === null) {
      summary.collections += entry.amount
      summary.paymentsReceived += 1
      continue
    }
    const linked = invoiceById.get(entry.invoiceId)
    if (!linked || toDateKey(linked.invoiceDate) < day) {
      summary.collections += entry.amount
      summary.paymentsReceived += 1
    }
  }

  return summary
}

export function computeBillingInsights(invoices: Invoice[], from: string, to: string): BillingInsights {
  const insights: BillingInsights = {
    sales: 0,
    collected: 0,
    stillDue: 0,
    billCount: 0,
    averageBill: 0,
    cash: 0,
    upi: 0,
    card: 0,
    mixed: 0,
    cashBillSales: 0,
    taxInvoiceSales: 0,
    goldGrams: 0,
    silverGrams: 0,
    makingCharges: 0,
  }

  for (const invoice of invoices) {
    if (!countsTowardSales(invoice) || !dateInRange(invoice.invoiceDate, from, to)) {
      continue
    }
    insights.billCount += 1
    insights.sales += invoice.total
    insights.collected += invoice.amountPaid
    insights.stillDue += invoice.balanceDue
    insights[invoice.paymentMode] += invoice.amountPaid
    if (invoice.billFormat === 'tax_invoice') {
      insights.taxInvoiceSales += invoice.total
    } else {
      insights.cashBillSales += invoice.total
    }
    addMetal(invoice, insights)
  }

  insights.averageBill = insights.billCount > 0 ? insights.sales / insights.billCount : 0
  return insights
}

export function invoiceMatchesFilters(
  invoice: Invoice,
  filters: {
    from?: string | null
    to?: string | null
    search: string
    status: StatusFilter
    paymentMode: 'all' | PaymentMode
    format: 'all' | Invoice['billFormat']
    duePaid?: DuePaidFilter
  }
): boolean {
  if (filters.from && filters.to && !dateInRange(invoice.invoiceDate, filters.from, filters.to)) {
    return false
  }
  if (filters.format !== 'all' && invoice.billFormat !== filters.format) {
    return false
  }
  if (filters.paymentMode !== 'all' && invoice.paymentMode !== filters.paymentMode) {
    return false
  }
  if (filters.status === 'draft' && (invoice.status !== 'draft' || invoice.isEstimate)) {
    return false
  }
  if (filters.status === 'final' && (invoice.status !== 'final' || invoice.isEstimate)) {
    return false
  }
  if (filters.status === 'estimate' && !invoice.isEstimate) {
    return false
  }
  if (filters.status === 'due' && !(invoice.status === 'final' && invoice.balanceDue > 0)) {
    return false
  }
  if (
    filters.status === 'paid' &&
    !(invoice.status === 'final' && !invoice.isEstimate && invoice.balanceDue <= 0)
  ) {
    return false
  }
  if (filters.duePaid === 'due' && !(invoice.status === 'final' && invoice.balanceDue > 0)) {
    return false
  }
  if (
    filters.duePaid === 'paid' &&
    !(invoice.status === 'final' && !invoice.isEstimate && invoice.balanceDue <= 0)
  ) {
    return false
  }

  const query = filters.search.trim().toLowerCase()
  if (!query) {
    return true
  }
  return (
    invoice.invoiceNo.toLowerCase().includes(query) ||
    invoice.customerName.toLowerCase().includes(query) ||
    invoice.customerPhone.toLowerCase().includes(query)
  )
}
