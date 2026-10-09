import { describe, expect, it } from 'vitest'
import type { Invoice, InvoiceItem } from '../../shared/types'
import { buildCashBillData } from '../../src/features/invoices/buildCashBillData'

function item(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: 1,
    invoiceId: 1,
    productId: 1,
    productName: 'Gold Chain',
    qty: 1,
    rate: 6800,
    lineTotal: 40000,
    grossWeight: 8.4,
    netWeight: 8.25,
    stoneWeight: 0.15,
    metalRate: 6800,
    makingCharges: 0,
    wastagePct: 7,
    stoneRate: 100,
    otherCharges: 0,
    lineSubtotal: 40000,
    lineTax: 0,
    hsnCode: '7113',
    lineKind: 'sale',
    description: 'Gold Chain',
    purity: '',
    huid: '',
    ...overrides,
  }
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    customerId: 1,
    customerName: 'Test',
    customerPhone: '999',
    invoiceNo: 'CB-2026-0001',
    invoiceDate: '2026-09-30',
    subtotal: 40000,
    tax: 0,
    total: 40000,
    status: 'final',
    items: [item()],
    createdAt: '2026-09-30T10:00:00',
    billFormat: 'cash_bill',
    paymentMode: 'cash',
    amountPaid: 40000,
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
    amountPayable: 40000,
    payments: [],
    ...overrides,
  }
}

describe('buildCashBillData', () => {
  it('emits wastage percent as vamc when wastage is set', () => {
    const data = buildCashBillData(invoice())
    expect(data.lines[0].vamc).toBe(7)
  })

  it('emits labour amount as vamc when wastage is zero', () => {
    const data = buildCashBillData(
      invoice({
        items: [item({ wastagePct: 0, makingCharges: 250 })],
      }),
    )
    expect(data.lines[0].vamc).toBe(250)
  })

  it('prints purity and HUID in the particulars', () => {
    const data = buildCashBillData(
      invoice({ items: [item({ purity: '22K', huid: 'ABC123' })] }),
    )
    expect(data.lines[0].particulars).toBe('Gold Chain (22K) · HUID ABC123')
  })

  it('prefers the stored customer and rate snapshots over live values', () => {
    const data = buildCashBillData(invoice(), {
      customer: { name: 'Snap Name', phone: '111', address: 'Old addr', gstin: '' },
      rates: {
        id: 0,
        effectiveDate: '2026-09-30',
        gold22k: 15125,
        gold24k: 16500,
        gold20k: 13750,
        gold18k: 12375,
        silverFine: 250,
        silver925: 231.48,
        createdAt: '',
      },
    })
    expect(data.customerName).toBe('Snap Name')
    expect(data.goldRate).toBe(15125)
    expect(data.silverRate).toBe(250)
  })

  it('stamps a draft print and leaves a final bill clean', () => {
    expect(buildCashBillData(invoice()).watermark).toBeNull()
    expect(
      buildCashBillData(invoice({ status: 'draft', invoiceNo: 'DRAFT-7' })).watermark,
    ).toBe('DRAFT')
    expect(
      buildCashBillData(
        invoice({ status: 'draft', isEstimate: true, invoiceNo: 'EST-2026-0003' }),
      ).watermark,
    ).toBe('ESTIMATE')
    expect(
      buildCashBillData(invoice({ status: 'draft', invoiceNo: 'CB-2026-0042' })).watermark,
    ).toBe('DRAFT')
  })
})
