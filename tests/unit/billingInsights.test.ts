import { describe, expect, it } from 'vitest'
import {
  computeBillingDaySummary,
  computeBillingInsights,
  invoiceMatchesFilters,
  monthRange,
} from '../../src/features/invoices/billingInsights'
import type { DueEntry, Invoice } from '../../shared/types'

function bill(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    customerId: 1,
    customerName: 'Test',
    customerPhone: '999',
    invoiceNo: 'CB-1',
    invoiceDate: '2026-09-24',
    subtotal: 1000,
    tax: 0,
    total: 1000,
    status: 'final',
    items: [],
    createdAt: '2026-09-24T10:00:00',
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

describe('billing insights', () => {
  it('sums final bills in the selected month and uses old-bill weights', () => {
    const range = monthRange('2026-09-24')
    const insights = computeBillingInsights(
      [
        bill({ total: 1000, amountPaid: 400, balanceDue: 600, paymentMode: 'upi' }),
        bill({
          id: 2,
          invoiceNo: 'OLD-1',
          invoiceDate: '2026-09-02',
          isHistorical: true,
          total: 5000,
          amountPaid: 5000,
          summaryGoldG: 12,
          summaryMaking: 800,
          billFormat: 'tax_invoice',
        }),
        bill({ id: 3, invoiceDate: '2026-08-31', total: 9999 }),
        bill({ id: 4, status: 'draft', total: 50 }),
      ],
      range.from,
      range.to,
    )

    expect(insights.sales).toBe(6000)
    expect(insights.collected).toBe(5400)
    expect(insights.stillDue).toBe(600)
    expect(insights.billCount).toBe(2)
    expect(insights.upi).toBe(400)
    expect(insights.cash).toBe(5000)
    expect(insights.taxInvoiceSales).toBe(5000)
    expect(insights.goldGrams).toBe(12)
    expect(insights.makingCharges).toBe(800)
  })
})

function dueEntry(overrides: Partial<DueEntry> = {}): DueEntry {
  return {
    id: 1,
    customerId: 1,
    entryDate: '2026-09-24',
    kind: 'payment',
    amount: 250,
    note: '',
    invoiceId: 99,
    invoiceNo: 'JTP-2026-0001',
    pledgeId: null,
    pledgeReceiptNo: null,
    createdAt: '2026-09-24T11:00:00',
    invoiceTotal: 1000,
    amountPaid: 250,
    balanceDue: 750,
    items: [],
    ...overrides,
  }
}

describe('billing day summary', () => {
  it('counts sales, collections, and bill mix for the selected day', () => {
    const olderBill = bill({
      id: 9,
      invoiceNo: 'OLD-DUE',
      invoiceDate: '2026-09-10',
      total: 2000,
      amountPaid: 500,
      balanceDue: 1500,
    })
    const summary = computeBillingDaySummary(
      [
        bill({ total: 1000, amountPaid: 400, balanceDue: 600, paymentMode: 'upi' }),
        bill({
          id: 2,
          invoiceNo: 'EST-1',
          isEstimate: true,
          total: 800,
          amountPaid: 0,
          balanceDue: 800,
        }),
        bill({ id: 3, status: 'draft', total: 50, amountPaid: 0, balanceDue: 50 }),
        bill({
          id: 4,
          invoiceNo: 'HIST-1',
          isHistorical: true,
          total: 9000,
          amountPaid: 9000,
        }),
        bill({ id: 5, invoiceDate: '2026-09-23', total: 9999, amountPaid: 9999 }),
        olderBill,
      ],
      [
        dueEntry({ invoiceId: olderBill.id, amount: 300 }),
        dueEntry({ id: 2, invoiceId: null, amount: 150 }),
        dueEntry({ id: 3, invoiceId: 1, amount: 50 }),
      ],
      '2026-09-24',
    )

    expect(summary.sales).toBe(1000)
    expect(summary.collections).toBe(850)
    expect(summary.billsGenerated).toBe(4)
    expect(summary.totalBills).toBe(4)
    expect(summary.paymentsReceived).toBe(3)
    expect(summary.finalCount).toBe(2)
    expect(summary.draftCount).toBe(1)
    expect(summary.estimateCount).toBe(1)
  })

  it('skips the date range when listing all bills', () => {
    expect(
      invoiceMatchesFilters(bill({ invoiceDate: '2026-01-01' }), {
        search: '',
        status: 'all',
        paymentMode: 'all',
        format: 'all',
      }),
    ).toBe(true)
  })

  it('keeps estimate bills off the draft chip and matches due, paid, and search', () => {
    const estimate = bill({ id: 2, status: 'draft', isEstimate: true, invoiceNo: 'EST-9' })
    const draft = bill({ id: 3, status: 'draft', invoiceNo: 'DR-1', customerPhone: '98765' })
    const due = bill({ id: 4, amountPaid: 200, balanceDue: 800, paymentMode: 'upi' })
    const paid = bill({ id: 5, amountPaid: 1000, balanceDue: 0, billFormat: 'tax_invoice' })

    expect(
      invoiceMatchesFilters(estimate, {
        search: '',
        status: 'draft',
        paymentMode: 'all',
        format: 'all',
      }),
    ).toBe(false)
    expect(
      invoiceMatchesFilters(estimate, {
        search: '',
        status: 'estimate',
        paymentMode: 'all',
        format: 'all',
      }),
    ).toBe(true)
    expect(
      invoiceMatchesFilters(draft, {
        search: '987',
        status: 'draft',
        paymentMode: 'all',
        format: 'all',
      }),
    ).toBe(true)
    expect(
      invoiceMatchesFilters(due, {
        search: '',
        status: 'final',
        paymentMode: 'upi',
        format: 'all',
        duePaid: 'due',
      }),
    ).toBe(true)
    expect(
      invoiceMatchesFilters(paid, {
        search: '',
        status: 'all',
        paymentMode: 'all',
        format: 'tax_invoice',
        duePaid: 'paid',
      }),
    ).toBe(true)
    expect(
      invoiceMatchesFilters(due, {
        from: '2026-09-24',
        to: '2026-09-24',
        search: '',
        status: 'all',
        paymentMode: 'all',
        format: 'all',
      }),
    ).toBe(true)
    expect(
      invoiceMatchesFilters(due, {
        from: '2026-09-25',
        to: '2026-09-25',
        search: '',
        status: 'all',
        paymentMode: 'all',
        format: 'all',
      }),
    ).toBe(false)
  })
})