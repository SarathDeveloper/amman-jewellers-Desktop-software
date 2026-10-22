import { describe, expect, it } from 'vitest'
import { EMPTY_PRODUCT_VARIANT_FIELDS, type Product } from '../../shared/types'
import {
  applyCurrentMetalRate,
  applyProductToLine,
  availableHuidsForLine,
  catalogApplyIndex,
  computeEditorLineTotal,
  computeSaleBreakdown,
  editorLineFromInvoiceItem,
  ensureTrailingEmptyLine,
  exclusiveVamc,
  isEmptyEditorLine,
  isOccupiedEditorLine,
  lineHuidError,
  lineNeedsHuid,
  lineOffersHuid,
  linesWithHuidError,
  newEditorLine,
  OLD_GOLD_PURITIES,
  oldGoldPurityOptions,
  metalForOldGoldPurity,
  oldGoldPuritySetsRate,
  productForHuid,
  huidCellState,
  pieceHuidLocked,
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

  it('keeps HUID on a manual line without a catalog product', () => {
    const items = toInvoiceItems([
      saleLine({
        productId: 0,
        description: 'Gold ring',
        huid: 'HI763837',
        metalRate: 7000,
        rate: 7000,
        netWeight: 2,
      }),
    ])
    expect(items[0].huid).toBe('HI763837')
  })
})

describe('computeSaleBreakdown VA/MC', () => {
  it('fills only VA when the line is in percent mode', () => {
    const breakdown = computeSaleBreakdown([
      saleLine({ vamcMode: 'pct', wastagePct: 4, makingCharges: 500 }),
    ])
    expect(breakdown.wastageAmount).toBe(1122)
    expect(breakdown.makingCharges).toBe(0)
    expect(breakdown.hasVa).toBe(true)
    expect(breakdown.hasMc).toBe(false)
  })

  it('fills only making charges when the line is a fixed amount', () => {
    const breakdown = computeSaleBreakdown([
      saleLine({ vamcMode: 'amount', wastagePct: 4, makingCharges: 1500 }),
    ])
    expect(breakdown.wastageAmount).toBe(0)
    expect(breakdown.makingCharges).toBe(1500)
    expect(breakdown.hasVa).toBe(false)
    expect(breakdown.hasMc).toBe(true)
  })

  it('keeps a selected mode visible when its amount is still zero', () => {
    const breakdown = computeSaleBreakdown([
      saleLine({ vamcMode: 'pct', wastagePct: 0, makingCharges: 0 }),
    ])
    expect(breakdown.wastageAmount).toBe(0)
    expect(breakdown.hasVa).toBe(true)
    expect(breakdown.hasMc).toBe(false)
  })

  it('adds stone weight times stone rate, and stays zero when there is no stone', () => {
    const withStone = computeSaleBreakdown([
      saleLine({ stoneWeight: 0.5, stoneRate: 500 }),
    ])
    expect(withStone.stoneValue).toBe(250)

    const withoutStone = computeSaleBreakdown([saleLine()])
    expect(withoutStone.stoneValue).toBe(0)
  })

  it('fills both rows on a mixed bill, each from its own lines', () => {
    const breakdown = computeSaleBreakdown([
      saleLine({ vamcMode: 'pct', wastagePct: 4, makingCharges: 0 }),
      saleLine({ vamcMode: 'amount', wastagePct: 0, makingCharges: 1500, netWeight: 1, qty: 2 }),
    ])
    expect(breakdown.wastageAmount).toBe(1122)
    expect(breakdown.makingCharges).toBe(3000)
    expect(breakdown.hasVa).toBe(true)
    expect(breakdown.hasMc).toBe(true)
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

  it('fills today\'s gold rate onto a placeholder auto line', () => {
    const line = applyCurrentMetalRate(newEditorLine(), rates)
    expect(line.purity).toBe('22K')
    expect(line.metalRateAuto).toBe(true)
    expect(line.metalRate).toBe(15125)
    expect(line.rate).toBe(15125)
  })

  it('fills today\'s gold rate onto a typed manual line', () => {
    const line = saleLine({
      productId: 0,
      description: 'Ring',
      metal: undefined,
      purity: '22K',
      metalRate: '',
      rate: '',
      metalRateAuto: true,
    })
    const next = applyCurrentMetalRate(line, rates)
    expect(next.metalRate).toBe(15125)
    expect(next.rate).toBe(15125)
  })
})

describe('newEditorLine', () => {
  it('starts as a 22K auto-rate placeholder', () => {
    const line = newEditorLine()
    expect(line.purity).toBe('22K')
    expect(line.metalRateAuto).toBe(true)
    expect(isEmptyEditorLine(line)).toBe(true)
    expect(isOccupiedEditorLine(line)).toBe(false)
  })

  it('applies settings rates when they are passed in', () => {
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
    const line = newEditorLine(rates)
    expect(line.metalRate).toBe(15125)
    expect(line.rate).toBe(15125)
    expect(isOccupiedEditorLine(line)).toBe(false)
  })
})

describe('occupied editor lines', () => {
  it('treats HUID or weights as occupying the starter row', () => {
    expect(isOccupiedEditorLine({ ...newEditorLine(), huid: 'HI763837' })).toBe(true)
    expect(isOccupiedEditorLine({ ...newEditorLine(), netWeight: 8, grossWeight: 7.5 })).toBe(true)
    expect(isOccupiedEditorLine({ ...newEditorLine(), wastagePct: 3 })).toBe(true)
    expect(isEmptyEditorLine({ ...newEditorLine(), huid: 'HI763837' })).toBe(true)
  })

  it('appends a trailing row after a HUID/weights-only line', () => {
    const occupied = { ...newEditorLine(), huid: 'HI763837', netWeight: 8, grossWeight: 7.5, stoneWeight: 0.5 }
    const next = ensureTrailingEmptyLine([occupied])
    expect(next).toHaveLength(2)
    expect(isOccupiedEditorLine(next[1])).toBe(false)
  })

  it('treats a blank placeholder row as not occupied', () => {
    expect(isOccupiedEditorLine(newEditorLine())).toBe(false)
  })

  it('does not reuse an occupied unnamed row as the catalog apply slot', () => {
    const occupied = { ...newEditorLine(), huid: 'HI763837', netWeight: 8, grossWeight: 7.5 }
    const placeholder = newEditorLine()
    expect(catalogApplyIndex([occupied])).toBe(-1)
    expect(catalogApplyIndex([occupied, placeholder])).toBe(1)
  })

  it('applies a scanned HUID onto the unnamed row that already has it', () => {
    const scanned = { ...newEditorLine(), huid: 'HI763837' }
    const placeholder = newEditorLine()
    expect(catalogApplyIndex([scanned, placeholder], 'HI763837')).toBe(0)
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

  it('prices a typed percent or karat from the 24K rate and keeps preset 22K', () => {
    expect(rateForOldGoldPurity('80%', rates)).toBe(13200)
    expect(rateForOldGoldPurity('14K', rates)).toBe(9625)
    expect(rateForOldGoldPurity('22K', rates)).toBe(15125)
    expect(oldGoldPuritySetsRate('22')).toBe(false)
    expect(oldGoldPuritySetsRate('80%')).toBe(false)
    expect(metalForOldGoldPurity('80%')).toBe('Gold')
    expect(metalForOldGoldPurity('14K')).toBe('Gold')
    expect(metalForOldGoldPurity('925')).toBe('Silver')
    expect(metalForOldGoldPurity('22K')).toBe('Gold')
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
    expect(linesWithHuidError([line], [tagged])).toHaveLength(1)
    expect(linesWithHuidError([{ ...line, huid: 'AAAAAA' }], [tagged])).toHaveLength(0)
  })

  it('offers HUID entry for a product with no tagged pieces but does not require it', () => {
    const untagged = product({ huids: [] })
    const line = saleLine({ huid: '' })
    expect(lineOffersHuid(line, [untagged])).toBe(true)
    expect(lineNeedsHuid(line, [untagged])).toBe(false)
    expect(linesWithHuidError([line], [untagged])).toHaveLength(0)
  })

  it('accepts a newly typed HUID on a tracked piece that has none', () => {
    const tagged = product({ stockQty: 2, huids: ['AAAAAA'] })
    const line = saleLine({ pieceId: 4, pieceHuid: '', huid: 'NEW1' })
    expect(pieceHuidLocked(line)).toBe(false)
    expect(lineHuidError(line, [tagged], [line])).toBeNull()
    const taken = saleLine({ pieceId: 4, pieceHuid: '', huid: 'AAAAAA' })
    expect(lineHuidError(taken, [tagged], [taken])).toBe('HUID AAAAAA is already tagged on this product')
  })

  it('keeps the HUID locked when the tracked piece already has one', () => {
    const line = saleLine({ pieceId: 4, pieceHuid: 'FH44', huid: 'FH44' })
    expect(pieceHuidLocked(line)).toBe(true)
    expect(pieceHuidLocked(saleLine({ pieceId: 4, huid: 'FH44' }))).toBe(true)
    expect(pieceHuidLocked(saleLine({ pieceId: 4, huid: '' }))).toBe(false)
  })

  it('accepts an untagged HUID typed for a product with no tagged pieces', () => {
    const untagged = product({ huids: [] })
    const line = saleLine({ huid: 'ZZZZZZ' })
    expect(lineHuidError(line, [untagged], [line])).toBeNull()
  })

  it('rejects a malformed HUID and a HUID used twice on the bill', () => {
    const malformed = saleLine({ key: 'a', huid: 'AB-1' })
    expect(lineHuidError(malformed, [tagged], [malformed])).toBe('HUID can only be letters and digits')

    const first = saleLine({ key: 'a', huid: 'AAAAAA' })
    const second = saleLine({ key: 'b', huid: 'AAAAAA' })
    expect(lineHuidError(second, [tagged], [first, second])).toBe('HUID AAAAAA is used twice on this bill')
  })

  it('accepts a HUID shorter than six characters', () => {
    const untagged = product({ huids: [] })
    const short = saleLine({ key: 'a', huid: 'AB' })
    expect(lineHuidError(short, [untagged], [short])).toBeNull()
  })

  it('requires one of the tagged HUIDs once every piece in stock is tagged', () => {
    const fullyTagged = product({ stockQty: 1, huids: ['AAAAAA'] })
    const untagged = saleLine({ huid: 'ZZZZZZ' })
    expect(lineHuidError(untagged, [fullyTagged], [untagged])).toBe(
      'HUID ZZZZZZ is not tagged on this product',
    )
    const picked = saleLine({ huid: 'AAAAAA' })
    expect(lineHuidError(picked, [fullyTagged], [picked])).toBeNull()
  })

  it('does not require a HUID when the product has none tagged', () => {
    const untagged = product({ huids: [] })
    const line = saleLine({ huid: '' })
    expect(linesWithHuidError([line], [untagged])).toHaveLength(0)
  })

  it('offers but does not require a HUID for silver while some pieces are untagged', () => {
    const silver = product({ metal: 'Silver', purity: '925', stockQty: 3, huids: ['AAAAAA'] })
    const line = saleLine({ huid: '' })
    expect(lineOffersHuid(line, [silver])).toBe(true)
    expect(lineNeedsHuid(line, [silver])).toBe(false)
    expect(linesWithHuidError([line], [silver])).toHaveLength(0)
  })

  it('requires a HUID once every piece in stock is tagged', () => {
    const silver = product({ metal: 'Silver', purity: '925', stockQty: 2, huids: ['AAAAAA', 'BBBBBB'] })
    expect(linesWithHuidError([saleLine({ huid: '' })], [silver])).toHaveLength(1)
  })
})

describe('productForHuid', () => {
  const tagged = product({ id: 1, huids: ['AAAAAA', 'BBBBBB'] })
  const other = product({ id: 2, name: 'Silver Ring', huids: ['CCCCCC'] })

  it('finds the sellable product that has the HUID tagged', () => {
    expect(productForHuid('aaaaaa', [tagged], [])?.id).toBe(1)
    expect(productForHuid('CCCCCC', [tagged, other], [])?.id).toBe(2)
  })

  it('returns null for an unknown code or a code claimed by another line', () => {
    expect(productForHuid('ZZZZZZ', [tagged], [])).toBeNull()
    const used = saleLine({ key: 'a', huid: 'AAAAAA' })
    expect(productForHuid('AAAAAA', [tagged], [used], 'b')).toBeNull()
    // The line that owns the code may still find it.
    expect(productForHuid('AAAAAA', [tagged], [used], 'a')?.id).toBe(1)
  })

  it('ignores an inactive product', () => {
    const inactive = product({ id: 3, huids: ['DDDDDD'], isActive: false })
    expect(productForHuid('DDDDDD', [inactive], [])).toBeNull()
  })
})

describe('huidCellState', () => {
  const tagged = product({ huids: ['AAAAAA'] })

  it('marks the empty row as a scan field', () => {
    expect(huidCellState(newEditorLine(), [tagged])).toEqual({ state: 'empty' })
  })

  it('marks a product line as a HUID picker', () => {
    expect(huidCellState(saleLine(), [tagged])).toEqual({ state: 'product' })
  })

  it('allows HUID entry on a manual line without a catalog item', () => {
    const manual = saleLine({ productId: 0, description: 'Loose stone' })
    expect(huidCellState(manual, [tagged])).toEqual({ state: 'manual' })
  })

  it('disables the cell when the line has more than one piece', () => {
    expect(huidCellState(saleLine({ qty: 2 }), [tagged])).toEqual({
      state: 'disabled',
      reason: 'One HUID per line',
    })
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
