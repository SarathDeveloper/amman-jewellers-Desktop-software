import { describe, expect, it } from 'vitest'
import { oldGoldPrintLines } from '../../src/features/invoices/oldGoldPrintLines'
import type { Invoice, InvoiceItem, OldGoldItem, OldGoldPurchaseLink } from '../../shared/types'

function bill(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    customerId: 1,
    customerName: 'Test',
    customerPhone: '999',
    invoiceNo: 'JTP-2026-0001',
    invoiceDate: '2026-09-28',
    subtotal: 1000,
    tax: 0,
    total: 1000,
    status: 'final',
    items: [],
    createdAt: '2026-09-28T10:00:00',
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

describe('oldGoldPrintLines', () => {
  it('prints linked purchase bills and leftover on-bill rows together', () => {
    const links: OldGoldPurchaseLink[] = [
      {
        id: 1,
        invoiceId: 1,
        purchaseId: 9,
        purchaseNo: 'OGP-2026-0001',
        customerName: 'Ramesh',
        purchaseDate: '2026-09-28',
        amountApplied: 50000,
        netWeight: 8,
      },
    ]
    const stored: OldGoldItem[] = [
      {
        id: 2,
        invoiceId: 1,
        description: 'Old studs',
        grossWeight: 2,
        stoneWeight: 0,
        netWeight: 2,
        purity: '22K',
        ratePerGram: 5000,
        deductionPct: 0,
        grossValue: 10000,
        deductionAmount: 0,
        finalValue: 10000,
      },
    ]

    expect(oldGoldPrintLines(bill({ oldGoldLinks: links, oldGold: stored }))).toEqual([
      { particulars: 'Old gold OGP-2026-0001 · Ramesh', weight: 8, amount: 50000 },
      { particulars: 'Old studs', weight: 2, amount: 10000 },
    ])
  })

  it('falls back to exchange line items when there are no stored rows or links', () => {
    const items: InvoiceItem[] = [
      {
        id: 1,
        invoiceId: 1,
        productId: 0,
        productName: 'Old chain',
        qty: 1,
        rate: 4000,
        lineTotal: -4000,
        grossWeight: 1,
        netWeight: 1,
        stoneWeight: 0,
        metalRate: 4000,
        makingCharges: 0,
        wastagePct: 0,
        stoneRate: 0,
        otherCharges: 0,
        lineSubtotal: -4000,
        lineTax: 0,
        hsnCode: '',
        metal: 'Gold',
        category: '',
        lineKind: 'exchange',
        description: '',
      },
    ]

    expect(oldGoldPrintLines(bill({ items }))).toEqual([
      { particulars: 'Old chain', weight: 1, amount: 4000 },
    ])
  })
})
