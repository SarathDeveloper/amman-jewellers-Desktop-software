import { describe, expect, it } from 'vitest'
import { printPreviewPaths, withEmbedFlag } from '../../src/features/print/printPreviewPaths'

describe('printPreviewPaths', () => {
  it('builds invoice, pledge, purchase, stock, and sample paths', () => {
    expect(printPreviewPaths.cashBill(12)).toBe('/print/cash-bill/12')
    expect(printPreviewPaths.taxInvoice(12)).toBe('/print/tax-invoice/12')
    expect(printPreviewPaths.invoice(12, 'cash_bill')).toBe('/print/cash-bill/12')
    expect(printPreviewPaths.invoice(12, 'tax_invoice')).toBe('/print/tax-invoice/12')
    expect(printPreviewPaths.pledge(4)).toBe('/print/pledge/4')
    expect(printPreviewPaths.pledgeRelease(4)).toBe('/print/pledge-release/4')
    expect(printPreviewPaths.purchase(9)).toBe('/print/purchase/9')
    expect(printPreviewPaths.metalDay('2026-09-30', 'Gold')).toBe('/print/metal-day/2026-09-30/Gold')
    expect(printPreviewPaths.stockClosing('2026-09-30', 'transacted')).toBe(
      '/print/stock-closing/2026-09-30?mode=transacted',
    )
    expect(printPreviewPaths.sample('cash')).toBe('/print/sample/cash')
  })
})

describe('withEmbedFlag', () => {
  it('adds embed=1 without dropping existing query params', () => {
    expect(withEmbedFlag('/print/cash-bill/12')).toBe('/print/cash-bill/12?embed=1')
    expect(withEmbedFlag('/print/stock-closing/2026-09-30?mode=all')).toBe(
      '/print/stock-closing/2026-09-30?mode=all&embed=1',
    )
  })
})
