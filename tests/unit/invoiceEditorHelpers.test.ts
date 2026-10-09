import { describe, expect, it } from 'vitest'
import { EMPTY_PRODUCT_VARIANT_FIELDS, type Product } from '../../shared/types'
import {
  applyCurrentMetalRate,
  applyProductToLine,
  availableHuidsForLine,
  computeEditorLineTotal,
  editorLineFromInvoiceItem,
  exclusiveVamc,
  lineNeedsHuid,
  lineOffersHuid,
  linesMissingHuid,
  newEditorLine,
  OLD_GOLD_PURITIES,
  oldGoldPurityOptions,
  qtyByProduct,
  rateForOldGoldPurity,
  stockAvailabilityLabel,
  stockShortageMessage,
  stockShortages,
  toInvoiceItems,
  vamcPatch,
  vamcValue,
  type EditorLine,
} from '../../src/features/invoices/invoiceEditorHelpers'
import type { InvoiceItem } from '../../shared/types'

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Gold Ring',
    category: 'Ring',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 2.7,
    netWeight: 2.5,
    makingCharges: 0,
    stockQty: 1,
    imagePath: '',
    updatedAt: '2026-01-01',
    ...EMPTY_PRODUCT_VARIANT_FIELDS,
    ...overrides,
  }
}

function saleLine(overrides: Partial<EditorLine> = {}): EditorLine {
  return {
    ...newEditorLine(),
    productId: 1,
    description: 'Gold Ring',
    qty: 1,
    rate: 14025,
    metalRate: 14025,
    grossWeight: 2,
    netWeight: 2,
    ...overrides,
  }
}

describe('vamcPatch', () => {
  it('writes wastage percent and zeros labour in pct mode', () => {
    const line = saleLine({ vamcMode: 'pct', makingCharges: 500, wastagePct: 0 })
    const patch = vamcPatch(line, { value: 7 })
    expect(patch).toEqual({ vamcMode: 'pct', wastagePct: 7, makingCharges: 0 })
    expect(vamcValue({ ...line, ...patch })).toBe(7)
  })

  it('writes labour amount and zeros wastage in amount mode', () => {
    const line = saleLine({ vamcMode: 'amount', makingCharges: 0, wastagePct: 4 })
    const patch = vamcPatch(line, { value: 500 })
    expect(patch).toEqual({ vamcMode: 'amount', wastagePct: 0, makingCharges: 500 })
    expect(vamcValue({ ...line, ...patch })).toBe(500)
  })

  it('clears the value when switching mode', () => {
    const line = saleLine({ vamcMode: 'pct', wastagePct: 7, makingCharges: 0 })
    const patch = vamcPatch(line, { mode: 'amount' })
    expect(patch).toEqual({ vamcMode: 'amount', wastagePct: 0, makingCharges: 0 })
    expect(vamcValue({ ...line, ...patch })).toBe(0)
  })
})

describe('applyProductToLine', () => {
  it('uses amount mode when the product has making charges', () => {
    const patch = applyProductToLine(product({ makingCharges: 400 }), 1, null)
    expect(patch.vamcMode).toBe('amount')
    expect(patch.makingCharges).toBe(400)
    expect(patch.wastagePct).toBe(0)
  })

  it('uses percent mode when the product has no making charges', () => {
    const patch = applyProductToLine(product({ makingCharges: 0 }), 1, null)
    expect(patch.vamcMode).toBe('pct')
    expect(patch.makingCharges).toBe(0)
    expect(patch.wastagePct).toBe(0)
  })

  it('fills the gold rate for a gold product and the silver rate for a silver product', () => {
    const rates = {
      id: 1,
      effectiveDate: '2026-09-30',
      gold24k: 16500,
      gold22k: 15125,
      gold20k: 13750,
      gold18k: 12375,
      silverFine: 250,
      silver925: 231.48,
      createdAt: '2026-09-30',
    }
    const gold = applyProductToLine(product({ metal: 'Gold', purity: '22K' }), 1, rates)
    expect(gold.metalRate).toBe(15125)
    expect(gold.rate).toBe(15125)

    const silver = applyProductToLine(
      product({ metal: 'Silver', purity: '925', name: 'Anklet' }),
      1,
      rates,
    )
    expect(silver.metalRate).toBe(231.48)
    expect(silver.rate).toBe(231.48)
  })
})

describe('toInvoiceItems', () => {
  it('sends only the active VA/MC field', () => {
    const pct = toInvoiceItems([
      saleLine({ vamcMode: 'pct', wastagePct: 4, makingCharges: 500 }),
    ])
    expect(pct[0].wastagePct).toBe(4)
    expect(pct[0].makingCharges).toBe(0)

    const amount = toInvoiceItems([
      saleLine({ vamcMode: 'amount', wastagePct: 4, makingCharges: 500 }),
    ])
    expect(amount[0].wastagePct).toBe(0)
    expect(amount[0].makingCharges).toBe(500)
  })

  it('keeps stored other charges so a re-save does not wipe old lines', () => {
    const items = toInvoiceItems([saleLine({ vamcMode: 'pct', wastagePct: 4, otherCharges: 150 })])
    expect(items[0].otherCharges).toBe(150)
  })

  it('includes a manual line with a description and no product', () => {
    const items = toInvoiceItems([
      saleLine({
        productId: 0,
        description: 'Gold chain',
        metalRate: 14000,
        rate: 14000,
        netWeight: 2,
        grossWeight: 2,
      }),
    ])
    expect(items).toHaveLength(1)
    expect(items[0].productId).toBeNull()
    expect(items[0].description).toBe('Gold chain')
  })
})

describe('exclusiveVamc and line total', () => {
  it('ignores leftover labour when the line is in percent mode', () => {
    const line = saleLine({ vamcMode: 'pct', wastagePct: 4, makingCharges: 500 })
    expect(exclusiveVamc(line)).toEqual({ mode: 'pct', wastagePct: 4, makingCharges: 0 })
    expect(computeEditorLineTotal(line)).toBe(29172)
  })

  it('totals a manual sale line without a product id', () => {
    const line = saleLine({
      productId: 0,
      description: 'Gold chain',
      vamcMode: 'pct',
      wastagePct: 0,
      makingCharges: 0,
      metalRate: 10000,
      rate: 10000,
      netWeight: 2,
      grossWeight: 2,
    })
    expect(computeEditorLineTotal(line)).toBe(20000)
  })
})

describe('editorLineFromInvoiceItem', () => {
  it('loads amount mode when making charges are set', () => {
    const item = {
      id: 1,
      invoiceId: 1,
      productId: 1,
      productName: 'Gold Ring',
      qty: 1,
      rate: 14025,
      lineTotal: 28550,
      grossWeight: 2,
      netWeight: 2,
      stoneWeight: 0,
      metalRate: 14025,
      makingCharges: 500,
      wastagePct: 0,
      stoneRate: 0,
      otherCharges: 0,
      lineSubtotal: 28550,
      lineTax: 0,
      hsnCode: '7113',
      lineKind: 'sale' as const,
      description: 'Gold Ring',
      huid: '',
    } satisfies InvoiceItem
    expect(editorLineFromInvoiceItem(item).vamcMode).toBe('amount')
    expect(editorLineFromInvoiceItem(item).metalRateAuto).toBe(false)
  })

  it('marks a missing metal rate as auto so today\'s rates can fill it', () => {
    const item = {
      id: 1,
      invoiceId: 1,
      productId: 1,
      productName: 'Gold Necklace',
      qty: 1,
      rate: 0,
      lineTotal: 1500,
      grossWeight: 18.5,
      netWeight: 18,
      stoneWeight: 0.5,
      metalRate: 0,
      makingCharges: 1500,
      wastagePct: 0,
      stoneRate: 0,
      otherCharges: 0,
      lineSubtotal: 1500,
      lineTax: 0,
      hsnCode: '7113',
      metal: 'Gold',
      lineKind: 'sale' as const,
      description: 'Gold Necklace',
      huid: '',
    } satisfies InvoiceItem
    expect(editorLineFromInvoiceItem(item).metalRateAuto).toBe(true)
  })
})

describe('applyCurrentMetalRate', () => {
  const rates = {
    id: 1,
    effectiveDate: '2026-09-30',
    gold24k: 16500,
    gold22k: 15125,
    gold20k: 13750,
    gold18k: 12375,
    silverFine: 250,
    silver925: 231.48,
    createdAt: '2026-09-30',
  }

  it('fills today\'s gold rate onto an auto line with a missing rate', () => {
    const line = saleLine({
      metal: 'Gold',
      purity: '22K',
      metalRate: 0,
      rate: 0,
      metalRateAuto: true,
    })
    const next = applyCurrentMetalRate(line, rates)
    expect(next.metalRate).toBe(15125)
    expect(next.rate).toBe(15125)
  })

  it('does not overwrite a cashier-typed rate', () => {
    const line = saleLine({
      metal: 'Gold',
      purity: '22K',
      metalRate: 14000,
      rate: 14000,
      metalRateAuto: false,
    })
    expect(applyCurrentMetalRate(line, rates)).toBe(line)
  })
})

describe('old gold purities', () => {
  const rates = {
    id: 1,
    effectiveDate: '2026-09-30',
    gold24k: 16500,
    gold22k: 15125,
    gold20k: 13750,
    gold18k: 12375,
    silverFine: 250,
    silver925: 231.48,
    createdAt: '2026-09-30',
  }

  it('lists gold karats and silver fineness', () => {
    expect(OLD_GOLD_PURITIES).toEqual(['24K', '22K', '20K', '18K', '999', '925'])
  })

  it('keeps a saved Silver value in the select options', () => {
    expect(oldGoldPurityOptions('Silver')).toEqual(['Silver', '24K', '22K', '20K', '18K', '999', '925'])
    expect(oldGoldPurityOptions('22K')).toEqual(['24K', '22K', '20K', '18K', '999', '925'])
  })

  it('fills the matching metal rate for each purity', () => {
    expect(rateForOldGoldPurity('24K', rates)).toBe(16500)
    expect(rateForOldGoldPurity('22K', rates)).toBe(15125)
    expect(rateForOldGoldPurity('20K', rates)).toBe(13750)
    expect(rateForOldGoldPurity('18K', rates)).toBe(12375)
    expect(rateForOldGoldPurity('999', rates)).toBe(250)
    expect(rateForOldGoldPurity('925', rates)).toBe(231.48)
    expect(rateForOldGoldPurity('Silver', rates)).toBe(250)
  })

  it('uses the old gold buying rate and falls back to the selling rate when unset', () => {
    const withBuyRates = {
      ...rates,
      gold22kBuy: 14000,
      gold24kBuy: 0,
      silver925Buy: 220,
    }
    expect(rateForOldGoldPurity('22K', withBuyRates)).toBe(14000)
    // Zero buying rate means "use the selling rate".
    expect(rateForOldGoldPurity('24K', withBuyRates)).toBe(16500)
    expect(rateForOldGoldPurity('925', withBuyRates)).toBe(220)
    expect(rateForOldGoldPurity('999', withBuyRates)).toBe(250)
    expect(rateForOldGoldPurity('22K', null)).toBe(0)
  })
})

describe('HUID line helpers', () => {
  const tagged = product({ huids: ['AAAAAA', 'BBBBBB'] })

  it('hides HUIDs already used by other lines but keeps the line selection', () => {
    const first = saleLine({ key: 'a', huid: 'AAAAAA' })
    const second = saleLine({ key: 'b', huid: 'BBBBBB' })
    expect(availableHuidsForLine(first, [tagged], [first, second])).toEqual(['AAAAAA'])
    expect(availableHuidsForLine(second, [tagged], [first, second])).toEqual(['BBBBBB'])

    const empty = saleLine({ key: 'c', huid: '' })
    expect(availableHuidsForLine(empty, [tagged], [first, empty])).toEqual(['BBBBBB'])
  })

  it('flags a tagged product line with no HUID and clears once picked', () => {
    const line = saleLine({ huid: '' })
    expect(linesMissingHuid([line], [tagged])).toHaveLength(1)
    expect(linesMissingHuid([{ ...line, huid: 'AAAAAA' }], [tagged])).toHaveLength(0)
  })

  it('does not require a HUID when the product has none tagged', () => {
    const untagged = product({ huids: [] })
    const line = saleLine({ huid: '' })
    expect(linesMissingHuid([line], [untagged])).toHaveLength(0)
  })

  it('offers but does not require a HUID for silver while some pieces are untagged', () => {
    const silver = product({ metal: 'Silver', purity: '925', stockQty: 3, huids: ['AAAAAA'] })
    const line = saleLine({ huid: '' })
    expect(lineOffersHuid(line, [silver])).toBe(true)
    expect(lineNeedsHuid(line, [silver])).toBe(false)
    expect(linesMissingHuid([line], [silver])).toHaveLength(0)
  })

  it('requires a HUID for silver once every piece in stock is tagged', () => {
    const silver = product({ metal: 'Silver', purity: '925', stockQty: 2, huids: ['AAAAAA', 'BBBBBB'] })
    expect(linesMissingHuid([saleLine({ huid: '' })], [silver])).toHaveLength(1)
  })
})

describe('stock availability helpers', () => {
  const stock = (id: number, stockQty: number) => product({ id, stockQty })

  it('counts every line of the same product', () => {
    const lines = [
      saleLine({ key: 'a', productId: 1, qty: 2 }),
      saleLine({ key: 'b', productId: 1, qty: 1 }),
      saleLine({ key: 'c', productId: 2, qty: 1 }),
    ]
    expect(qtyByProduct(lines)).toEqual({ 1: 3, 2: 1 })
  })

  it('flags the line that pushes a product past its stock', () => {
    const lines = [
      saleLine({ key: 'a', productId: 1, qty: 2 }),
      saleLine({ key: 'b', productId: 1, qty: 2 }),
    ]
    const shortages = stockShortages(lines, [stock(1, 3)])
    expect(shortages).toHaveLength(1)
    expect(shortages[0]).toMatchObject({ key: 'b', productId: 1, requested: 4, available: 3 })
    expect(stockShortageMessage(shortages[0])).toBe(
      'Insufficient stock for Gold Ring (3 available, 4 on this bill)',
    )
  })

  it('leaves a bill inside stock and manual lines alone', () => {
    const lines = [
      saleLine({ key: 'a', productId: 1, qty: 3 }),
      saleLine({ key: 'b', productId: null, description: 'Loose stone', qty: 99 }),
    ]
    expect(stockShortages(lines, [stock(1, 3)])).toEqual([])
  })

  it('labels an option by remaining stock', () => {
    expect(stockAvailabilityLabel(4)).toBe('4 in stock')
    expect(stockAvailabilityLabel(4, 1)).toBe('3 in stock')
    expect(stockAvailabilityLabel(4, 4)).toBe('All 4 on this bill')
    expect(stockAvailabilityLabel(0)).toBe('Out of stock')
  })
})
