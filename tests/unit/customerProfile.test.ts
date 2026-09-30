import { describe, expect, it } from 'vitest'
import { buildCustomerProfile } from '../../src/features/customers/customerProfile'
import type { CustomerDuesColumn, DueEntry, Invoice } from '../../shared/types'

function bill(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    customerId: 1,
    customerName: 'Test',
    customerPhone: '999',
    invoiceNo: 'JTP-2026-0001',
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

function entry(overrides: Partial<DueEntry> = {}): DueEntry {
  return {
    id: 1,
    customerId: 1,
    entryDate: '2026-09-24',
    kind: 'due',
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

function column(overrides: Partial<CustomerDuesColumn> = {}): CustomerDuesColumn {
  return {
    customerId: 1,
    customerName: 'Test',
    customerPhone: '999',
    balance: 0,
    entries: [],
    ...overrides,
  }
}

describe('buildCustomerProfile', () => {
  it('ignores drafts and estimates in purchases and totals', () => {
    const invoices = [
      bill({ id: 1, total: 2000, amountPaid: 2000, invoiceNo: 'JTP-1' }),
      bill({ id: 2, total: 800, amountPaid: 0, status: 'draft', invoiceNo: 'JTP-2' }),
      bill({ id: 3, total: 300, amountPaid: 300, isEstimate: true, invoiceNo: 'JTP-3' }),
      bill({ id: 4, customerId: 2, total: 900, amountPaid: 900, invoiceNo: 'JTP-4' }),
    ]

    const profile = buildCustomerProfile(1, invoices)

    expect(profile.totalPurchases).toBe(2000)
    expect(profile.purchases).toHaveLength(1)
    expect(profile.purchases[0].invoiceNo).toBe('JTP-1')
  })

  it('includes a fully paid counter bill in payment history', () => {
    const invoices = [bill({ id: 10, total: 1500, amountPaid: 1500, balanceDue: 0, invoiceNo: 'JTP-10' })]

    const profile = buildCustomerProfile(1, invoices)

    expect(profile.payments).toEqual([
      { id: 'invoice-10', date: '2026-09-24', amount: 1500, invoiceNo: 'JTP-10' },
    ])
    expect(profile.totalPaid).toBe(1500)
    expect(profile.outstanding).toBe(0)
  })

  it('does not double-count an invoice-linked collection in Total Paid', () => {
    const invoices = [
      bill({
        id: 5,
        total: 2000,
        amountPaid: 2000,
        balanceDue: 0,
        invoiceNo: 'JTP-5',
      }),
    ]
    const dues = column({
      balance: 0,
      entries: [
        entry({
          id: 21,
          kind: 'due',
          amount: 2000,
          invoiceId: 5,
          invoiceNo: 'JTP-5',
        }),
        entry({
          id: 22,
          kind: 'payment',
          amount: 800,
          invoiceId: 5,
          invoiceNo: 'JTP-5',
          entryDate: '2026-09-24',
        }),
        entry({
          id: 23,
          kind: 'payment',
          amount: 1200,
          invoiceId: 5,
          invoiceNo: 'JTP-5',
          entryDate: '2026-09-25',
        }),
      ],
    })

    const profile = buildCustomerProfile(1, invoices, dues)

    expect(profile.totalPaid).toBe(2000)
    expect(profile.payments.map((row) => row.id)).toEqual(['due-23', 'due-22'])
    expect(profile.payments.every((row) => row.id.startsWith('invoice-'))).toBe(false)
  })

  it('includes a manual unlinked payment in Total Paid and payment history', () => {
    const invoices = [bill({ id: 6, total: 1000, amountPaid: 400, balanceDue: 600, invoiceNo: 'JTP-6' })]
    const dues = column({
      balance: 200,
      entries: [
        entry({ id: 31, kind: 'due', amount: 600, invoiceId: 6, invoiceNo: 'JTP-6' }),
        entry({
          id: 32,
          kind: 'payment',
          amount: 400,
          invoiceId: 6,
          invoiceNo: 'JTP-6',
          entryDate: '2026-09-24',
        }),
        entry({
          id: 33,
          kind: 'payment',
          amount: 200,
          invoiceId: null,
          invoiceNo: null,
          entryDate: '2026-09-26',
        }),
      ],
    })

    const profile = buildCustomerProfile(1, invoices, dues)

    expect(profile.totalPaid).toBe(600)
    expect(profile.payments).toEqual([
      { id: 'due-33', date: '2026-09-26', amount: 200, invoiceNo: null },
      { id: 'due-32', date: '2026-09-24', amount: 400, invoiceNo: 'JTP-6' },
    ])
  })

  it('uses the ledger balance for outstanding when a column exists', () => {
    const invoices = [bill({ id: 7, total: 3000, amountPaid: 1000, balanceDue: 2000 })]
    const dues = column({
      balance: 2500,
      entries: [
        entry({ id: 41, kind: 'due', amount: 2000, invoiceId: 7, invoiceNo: 'JTP-2026-0001' }),
        entry({ id: 42, kind: 'due', amount: 500, invoiceId: null, invoiceNo: null, entryDate: '2026-09-20' }),
      ],
    })

    const profile = buildCustomerProfile(1, invoices, dues)

    expect(profile.outstanding).toBe(2500)
    expect(profile.dues).toHaveLength(2)
    expect(profile.dues[0].invoiceNo).toBe('JTP-2026-0001')
  })

  it('falls back to bill balanceDue when there is no ledger column', () => {
    const invoices = [
      bill({ id: 8, total: 1200, amountPaid: 200, balanceDue: 1000, invoiceDate: '2026-09-22' }),
      bill({ id: 9, total: 400, amountPaid: 0, balanceDue: 400, invoiceDate: '2026-09-23' }),
    ]

    const profile = buildCustomerProfile(1, invoices)

    expect(profile.outstanding).toBe(1400)
    expect(profile.dues).toEqual([])
    expect(profile.purchases.map((row) => row.invoiceId)).toEqual([9, 8])
  })
})
