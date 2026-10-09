import { roundMoney } from '@shared/billing/pricing'
import type { CustomerDuesColumn, DueEntry, Invoice, OldGoldPurchase } from '@shared/types'

export interface CustomerPurchaseRow {
  invoiceId: number
  invoiceNo: string
  date: string
  total: number
  amountPaid: number
  balanceDue: number
}

export interface CustomerPaymentRow {
  id: string
  date: string
  amount: number
  invoiceNo: string | null
}

export interface CustomerDueRow {
  id: number
  date: string
  amount: number
  invoiceNo: string | null
}

export interface CustomerOldGoldRow {
  id: number
  purchaseNo: string
  date: string
  netWeight: number
  amount: number
  paidOut: number
  balance: number
  status: OldGoldPurchase['status']
}

export interface CustomerProfileSummary {
  totalPurchases: number
  totalPaid: number
  outstanding: number
  purchases: CustomerPurchaseRow[]
  payments: CustomerPaymentRow[]
  dues: CustomerDueRow[]
  oldGold: CustomerOldGoldRow[]
  oldGoldAmount: number
  oldGoldNetWeight: number
  oldGoldOpenBalance: number
}

function isFinalPurchase(invoice: Invoice): boolean {
  return invoice.status === 'final' && !invoice.isEstimate
}

function byNewestDateThenId<T extends { date: string; id: number | string }>(a: T, b: T): number {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1
  }
  return String(b.id).localeCompare(String(a.id), undefined, { numeric: true })
}

function purchaseRows(invoices: Invoice[]): CustomerPurchaseRow[] {
  return invoices
    .filter(isFinalPurchase)
    .map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      date: invoice.invoiceDate,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      balanceDue: invoice.balanceDue,
    }))
    .sort((a, b) => byNewestDateThenId({ ...a, id: a.invoiceId }, { ...b, id: b.invoiceId }))
}

function paymentRows(invoices: Invoice[], entries: DueEntry[]): CustomerPaymentRow[] {
  const ledgerPayments = entries.filter((entry) => entry.kind === 'payment')
  const paidInvoiceIds = new Set(
    ledgerPayments
      .map((entry) => entry.invoiceId)
      .filter((invoiceId): invoiceId is number => invoiceId !== null),
  )

  const fromLedger: CustomerPaymentRow[] = ledgerPayments.map((entry) => ({
    id: `due-${entry.id}`,
    date: entry.entryDate,
    amount: entry.amount,
    invoiceNo: entry.invoiceNo,
  }))

  const fromBills: CustomerPaymentRow[] = invoices
    .filter((invoice) => isFinalPurchase(invoice) && invoice.amountPaid > 0 && !paidInvoiceIds.has(invoice.id))
    .map((invoice) => ({
      id: `invoice-${invoice.id}`,
      date: invoice.invoiceDate,
      amount: invoice.amountPaid,
      invoiceNo: invoice.invoiceNo,
    }))

  return [...fromLedger, ...fromBills].sort(byNewestDateThenId)
}

function dueRows(entries: DueEntry[]): CustomerDueRow[] {
  return entries
    .filter((entry) => entry.kind === 'due')
    .map((entry) => ({
      id: entry.id,
      date: entry.entryDate,
      amount: entry.amount,
      invoiceNo: entry.invoiceNo,
    }))
    .sort((a, b) => byNewestDateThenId(a, b))
}

function oldGoldRows(customerId: number, purchases: OldGoldPurchase[]): CustomerOldGoldRow[] {
  return (purchases ?? [])
    .filter((purchase) => purchase.customerId === customerId && purchase.status !== 'draft')
    .map((purchase) => ({
      id: purchase.id,
      purchaseNo: purchase.purchaseNo,
      date: purchase.purchaseDate,
      netWeight: purchase.items.reduce((sum, item) => sum + item.netWeight, 0),
      amount: purchase.totalAmount,
      paidOut: purchase.paidOut,
      balance: purchase.balance,
      status: purchase.status,
    }))
    .sort(byNewestDateThenId)
}

export function buildCustomerProfile(
  customerId: number,
  invoices: Invoice[],
  column?: CustomerDuesColumn,
  oldGoldPurchases: OldGoldPurchase[] = [],
): CustomerProfileSummary {
  const customerInvoices = (invoices ?? []).filter((invoice) => invoice.customerId === customerId)
  const purchases = purchaseRows(customerInvoices)
  const entries = column?.entries ?? []
  const payments = paymentRows(customerInvoices, entries)
  const dues = dueRows(entries)
  const oldGold = oldGoldRows(customerId, oldGoldPurchases)
  const oldGoldAmount = roundMoney(oldGold.reduce((sum, row) => sum + row.amount, 0))
  const oldGoldNetWeight = Math.round(oldGold.reduce((sum, row) => sum + row.netWeight, 0) * 1000) / 1000
  const oldGoldOpenBalance = roundMoney(oldGold.reduce((sum, row) => sum + row.balance, 0))

  const totalPurchases = purchases.reduce((sum, row) => sum + row.total, 0)
  const invoicePaid = purchases.reduce((sum, row) => sum + row.amountPaid, 0)
  const unlinkedPaid = entries
    .filter((entry) => entry.kind === 'payment' && entry.invoiceId === null)
    .reduce((sum, entry) => sum + entry.amount, 0)
  const outstanding =
    column !== undefined
      ? column.balance
      : purchases.reduce((sum, row) => sum + row.balanceDue, 0)

  return {
    totalPurchases,
    totalPaid: invoicePaid + unlinkedPaid,
    outstanding,
    purchases,
    payments,
    dues,
    oldGold,
    oldGoldAmount,
    oldGoldNetWeight,
    oldGoldOpenBalance,
  }
}
