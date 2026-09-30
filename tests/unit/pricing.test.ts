import { describe, expect, it } from 'vitest'
import { computeLinePricing, computeInvoiceTotals, computePurchaseLineAmount, linePricingFromProduct, resolveMetalRateForProduct } from '../../shared/billing/pricing'
import { EMPTY_PRODUCT_VARIANT_FIELDS } from '../../shared/types'

describe('billing pricing', () => {
  it('computes metal weight line total', () => {
    const priced = computeLinePricing(
      linePricingFromProduct(
        {
          id: 1,
          name: 'Chain',
          category: 'Chain',
          metal: 'Silver',
          purity: 'Fine',
          grossWeight: 150,
          netWeight: 139.25,
          makingCharges: 0,
          stockQty: 1,
          imagePath: '',
          updatedAt: '',
          ...EMPTY_PRODUCT_VARIANT_FIELDS,
        },
        1,
        106,
      ),
    )
    expect(priced.lineTotal).toBe(14760.5)
  })

  it('adds per-line other charges to the line total', () => {
    const priced = computeLinePricing({
      qty: 1,
      metalRate: 14025,
      grossWeight: 2,
      netWeight: 2,
      stoneWeight: 0,
      makingCharges: 500,
      wastagePct: 4,
      stoneRate: 0,
      otherCharges: 150,
    })
    expect(priced.lineTotal).toBe(29822)
  })

  it('splits GST for intra-state tax invoice totals', () => {
    const totals = computeInvoiceTotals([10000], 0, true, false, 0)
    expect(totals.tax).toBe(300)
    expect(totals.cgst).toBe(150)
    expect(totals.sgst).toBe(150)
    expect(totals.total).toBe(10300)
  })

  it('resolves 18K gold and 925 silver against their own rates', () => {
    const rates = {
      gold24k: 16500,
      gold22k: 15125,
      gold20k: 13750,
      gold18k: 12375,
      silverFine: 250,
      silver925: 231.48,
    }
    expect(
      resolveMetalRateForProduct(
        {
          id: 1,
          name: 'Bangle',
          category: 'Bangle',
          metal: 'Gold',
          purity: '18K',
          grossWeight: 10,
          netWeight: 10,
          makingCharges: 0,
          stockQty: 1,
          imagePath: '',
          updatedAt: '',
          ...EMPTY_PRODUCT_VARIANT_FIELDS,
        },
        rates,
      ),
    ).toBe(12375)
    expect(
      resolveMetalRateForProduct(
        {
          id: 2,
          name: 'Chain',
          category: 'Chain',
          metal: 'Silver',
          purity: '925',
          grossWeight: 10,
          netWeight: 10,
          makingCharges: 0,
          stockQty: 1,
          imagePath: '',
          updatedAt: '',
          ...EMPTY_PRODUCT_VARIANT_FIELDS,
        },
        rates,
      ),
    ).toBe(231.48)
  })

  it('computes purchase line amount as net weight times pieces times rate plus making', () => {
    expect(
      computePurchaseLineAmount({ qty: 3, netWeight: 2, rate: 100, makingCharges: 0 }),
    ).toBe(600)
    expect(
      computePurchaseLineAmount({ qty: 1, netWeight: 8, rate: 100, makingCharges: 250 }),
    ).toBe(1050)
  })
})
