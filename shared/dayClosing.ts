import { roundMoney } from './billing/pricing'
import type { DueEntry, Invoice, PaymentMode } from './types'

export function toBusinessDate(value: string): string {
  return value.slice(0, 10)
}

export function countsTowardDaySales(invoice: Invoice, day: string): boolean {
  return (
    invoice.status === 'final' &&
    !invoice.isEstimate &&
    !invoice.isHistorical &&
    toBusinessDate(invoice.invoiceDate) === day
  )
}

export function sumPaidByMode(invoices: Invoice[], day: string): Record<PaymentMode, number> {
  const totals: Record<PaymentMode, number> = { cash: 0, upi: 0, card: 0, mixed: 0 }
  for (const invoice of invoices) {
    if (!countsTowardDaySales(invoice, day)) {
      continue
    }
    totals[invoice.paymentMode] += invoice.amountPaid
  }
  return {
    cash: roundMoney(totals.cash),
    upi: roundMoney(totals.upi),
    card: roundMoney(totals.card),
    mixed: roundMoney(totals.mixed),
  }
}

export function computeDueCollection(invoices: Invoice[], entries: DueEntry[], day: string): number {
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  let total = 0
  for (const entry of entries) {
    if (entry.kind !== 'payment' || toBusinessDate(entry.entryDate) !== day) {
      continue
    }
    if (entry.invoiceId === null) {
      total += entry.amount
      continue
    }
    const linked = invoiceById.get(entry.invoiceId)
    if (!linked || toBusinessDate(linked.invoiceDate) < day) {
      total += entry.amount
    }
  }
  return roundMoney(total)
}

export function computeExpectedCash(openingCash: number, cashSales: number): number {
  return roundMoney(openingCash + cashSales)
}

export function computeCashDifference(actualCash: number, expectedCash: number): number {
  return roundMoney(actualCash - expectedCash)
}
