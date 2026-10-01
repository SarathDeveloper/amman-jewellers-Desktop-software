import { describe, expect, it } from 'vitest'
import { EMPTY_PRODUCT_VARIANT_FIELDS, type Product } from '../../shared/types'
import {
  applyCurrentMetalRate,
  applyProductToLine,
  computeEditorLineTotal,
  editorLineFromInvoiceItem,
  exclusiveVamc,
  newEditorLine,
  OLD_GOLD_PURITIES,
  oldGoldPurityOptions,
  rateForOldGoldPurity,
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
})

describe('exclusiveVamc and line total', () => {
  it('ignores leftover labour when the line is in percent mode', () => {
    const line = saleLine({ vamcMode: 'pct', wastagePct: 4, makingCharges: 500 })
    expect(exclusiveVamc(line)).toEqual({ mode: 'pct', wastagePct: 4, makingCharges: 0 })
    expect(computeEditorLineTotal(line)).toBe(29172)
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
})
