import { describe, expect, it } from 'vitest'
import type { Inward } from '../../shared/types'
import {
  buildPurchaseInvoiceData,
  purchaseGrossWeight,
  purchaseItemName,
} from '../../src/features/inwards/buildPurchaseInvoiceData'

const baseInward: Inward = {
  id: 1,
  supplierId: 1,
  supplierName: 'Test Goldsmith',
  supplierPhone: '9876543210',
  supplierAddress: 'Salem',
  supplierGstin: '33ABCDE1234F1Z5',
  inwardNo: 'IN-2026-0001',
  inwardDate: '2026-09-28',
  status: 'final',
  paymentMode: 'cash',
  subtotal: 600,
  cgst: 9,
  sgst: 9,
  igst: 0,
  roundOff: 0,
  total: 618,
  notes: 'Sample',
  createdAt: '2026-09-28T10:00:00.000Z',
  finalizedAt: '2026-09-28T10:00:00.000Z',
  items: [
    {
      id: 1,
      inwardId: 1,
      productId: 4,
      productName: 'Gold chain',
      metal: 'Gold',
      category: 'Chain',
      purity: '22K',
      qty: 1,
      grossWeight: 8.5,
      netWeight: 8,
      rate: 100,
      makingCharges: 250,
      hsnCode: '7113',
      lineTotal: 1050,
    },
  ],
}

describe('purchase invoice data', () => {
  it('uses the product name and stored gross weight', () => {
    const data = buildPurchaseInvoiceData(baseInward)
    expect(data.invoiceDate).toBe('28 Sep 2026')
    expect(data.lines[0]?.item).toBe('Gold chain')
    expect(data.lines[0]?.grossWeight).toBe(8.5)
    expect(data.amountInWords).toContain('Six Hundred Eighteen')
    expect(data.watermark).toBeNull()
  })

  it('stamps a draft purchase so it is not mistaken for a final invoice', () => {
    expect(buildPurchaseInvoiceData({ ...baseInward, status: 'draft' }).watermark).toBe('DRAFT')
  })

  it('falls back to category and net weight when product or gross is missing', () => {
    const raw = baseInward.items[0]
    expect(raw).toBeDefined()
    if (!raw) return
    expect(purchaseItemName({ ...raw, productName: null })).toBe('Chain')
    expect(purchaseGrossWeight({ ...raw, grossWeight: 0 })).toBe(8)
  })
})
