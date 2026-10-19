import { describe, expect, it } from 'vitest'
import { EMPTY_PRODUCT_VARIANT_FIELDS } from '../../shared/types'
import type { Product } from '../../shared/types'
import {
  categoryOptions,
  defaultPurityForMetal,
  emptyProductForm,
  existingPiecesToUpdateInput,
  formToProductInput,
  metalOptions,
  newOpeningPiece,
  resizeOpeningPieces,
  productInputForSource,
  productMatchesListContext,
  purityOptions,
  resolvePurityForMetal,
  validateExistingPieceEdits,
  validateProductForm,
  type ExistingPieceEditRow,
  type ProductFormState,
} from '../../src/features/products/productForm'

function form(overrides: Partial<ProductFormState> = {}): ProductFormState {
  return {
    ...emptyProductForm,
    name: 'Gold chain',
    category: 'Chain',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 10,
    netWeight: 9,
    makingCharges: 100,
    stockQty: 4,
    imagePath: '',
    huids: ['AA0001', 'AA0002', 'AA0003', 'AA0004'],
    openingPieces: [],
    ...overrides,
  }
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Gold chain',
    category: 'Chain',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 10,
    netWeight: 9,
    makingCharges: 100,
    stockQty: 4,
    imagePath: '',
    updatedAt: '2026-01-01',
    ...EMPTY_PRODUCT_VARIANT_FIELDS,
    ...overrides,
  }
}

describe('product form options', () => {
  it('keeps Gold and Silver first and preserves a custom metal', () => {
    expect(metalOptions('White Gold')).toEqual(['Gold', 'Silver', 'White Gold'])
  })

  it('uses stock category names and keeps the current value', () => {
    const options = categoryOptions(['Chain', 'Ring'], 'Temple set')
    expect(options[0]).toBe('Chain')
    expect(options).toContain('Temple set')
    expect(options.filter((item) => item === 'Temple set')).toHaveLength(1)
  })

  it('uses gold purities for gold and keeps extras from the catalogue', () => {
    expect(purityOptions('Gold', [product({ purity: '18K' })], '18K')).toEqual(['24K', '22K', '18K'])
    expect(purityOptions('Silver', [product({ metal: 'Silver', purity: '999' })], '')).toEqual([
      '925',
      '999',
    ])
  })

  it('defaults purity from metal', () => {
    expect(defaultPurityForMetal('Gold')).toBe('22K')
    expect(defaultPurityForMetal('Silver')).toBe('925')
  })

  it('resets purity when the current value does not belong to the new metal', () => {
    expect(resolvePurityForMetal('Silver', '22K', [])).toBe('925')
    expect(resolvePurityForMetal('Gold', '925', [])).toBe('22K')
    expect(resolvePurityForMetal('Gold', '18K', [])).toBe('18K')
  })
})

describe('validateProductForm', () => {
  it('rejects a category that is not in the stock list', () => {
    const errors = validateProductForm(form({ category: 'Bracelet' }), [], null, ['Chain', 'Ring'])
    expect(errors.category).toBe('Category does not exist. Create it in Stock first.')
  })

  it('allows a new category name when Other is selected', () => {
    expect(
      validateProductForm(form({ category: 'Bracelet' }), [], null, ['Chain'], true).category,
    ).toBeUndefined()
  })

  it('rejects a new category name longer than 80 characters', () => {
    const errors = validateProductForm(form({ category: 'x'.repeat(81) }), [], null, [], true)
    expect(errors.category).toBe('Category name must be 80 characters or less')
  })

  it('requires name', () => {
    const errors = validateProductForm(form({ name: '' }), [], null)
    expect(errors.name).toBe('Name is required')
  })

  it('rejects net weight above gross weight', () => {
    const errors = validateProductForm(form({ grossWeight: 2, netWeight: 3 }), [], null)
    expect(errors.netWeight).toBe('Net weight cannot exceed gross weight')
  })

  it('rejects stone weight above gross weight', () => {
    const errors = validateProductForm(form({ grossWeight: 2, stoneWeight: 3 }), [], null)
    expect(errors.stoneWeight).toBe('Stone weight cannot exceed gross weight')
  })

  it('accepts HUIDs of any length', () => {
    expect(validateProductForm(form({ huids: ['A1B2C'] }), [], null).huids).toBeUndefined()
    expect(validateProductForm(form({ huids: ['AB'] }), [], null).huids).toBeUndefined()
  })

  it('rejects a HUID with symbols', () => {
    const errors = validateProductForm(form({ huids: ['AB-12'] }), [], null)
    expect(errors.huids).toBe('HUID can only be letters and digits')
  })

  it('rejects a duplicated HUID in the form', () => {
    const errors = validateProductForm(form({ huids: ['a1b2c3', 'A1B2C3'] }), [], null)
    expect(errors.huids).toBe('HUID A1B2C3 is duplicated')
  })

  it('allows gold pieces to be saved without HUIDs', () => {
    expect(validateProductForm(form({ stockQty: 2, huids: ['A1B2C3'] }), [], null).huids).toBeUndefined()
    expect(
      validateProductForm(form({ stockQty: 4, huids: ['', '', '', ''] }), [], null).huids,
    ).toBeUndefined()
  })

  it('never lets HUIDs exceed the piece count', () => {
    expect(
      validateProductForm(form({ stockQty: 1, huids: ['A1B2C3', 'D4E5F6'] }), [], null).huids,
    ).toBe('A product cannot have more HUIDs than pieces in stock')
    const silver = { metal: 'Silver', purity: '925' }
    expect(validateProductForm(form({ ...silver, stockQty: 2, huids: [''] }), [], null).huids).toBeUndefined()
    expect(
      validateProductForm(form({ ...silver, stockQty: 1, huids: ['A1B2C3', 'D4E5F6'] }), [], null).huids,
    ).toBe('A product cannot have more HUIDs than pieces in stock')
  })
})

describe('formToProductInput', () => {
  it('trims text and stores stock as a whole number', () => {
    const input = formToProductInput(form({ name: '  Gold chain  ', stockQty: 4.8 }))
    expect(input.name).toBe('Gold chain')
    expect(input.stockQty).toBe(4)
  })

  it('keeps the uploaded image path', () => {
    const input = formToProductInput(form({ imagePath: ' /tmp/ring.jpg ' }))
    expect(input.imagePath).toBe('/tmp/ring.jpg')
  })

  it('sends one opening piece per row, with that row’s weight and HUID', () => {
    const input = formToProductInput(
      form({
        trackPieces: true,
        stockQty: 2,
        openingPieces: [
          { ...newOpeningPiece({ grossWeight: 5.2, stoneWeight: 0.2, netWeight: 5 }), huid: 'fh44' },
          { ...newOpeningPiece({ grossWeight: 5.4, stoneWeight: 0.4, netWeight: 5 }), huid: '' },
        ],
      }),
    )
    expect(input.pieces).toEqual([
      { huid: 'FH44', grossWeight: 5.2, stoneWeight: 0.2, netWeight: 5 },
      { huid: '', grossWeight: 5.4, stoneWeight: 0.4, netWeight: 5 },
    ])
    expect(input.huids).toEqual(['FH44'])
  })

  it('adds a piece row when the stock quantity grows', () => {
    const first = newOpeningPiece({ grossWeight: 5, stoneWeight: 0, netWeight: 5 })
    const next = resizeOpeningPieces([first], 2, { grossWeight: 5, stoneWeight: 0, netWeight: 5 })
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(first)
    expect(next[1].netWeight).toBe(5)
    expect(resizeOpeningPieces(next, 2, { grossWeight: 1, stoneWeight: 0, netWeight: 1 })).toBe(next)
  })

  it('requires a net weight on each opening piece', () => {
    const errors = validateProductForm(
      form({
        trackPieces: true,
        stockQty: 1,
        openingPieces: [newOpeningPiece({ grossWeight: 5, stoneWeight: 0, netWeight: '' })],
      }),
      [],
      null,
    )
    expect(errors.pieces).toBe('Enter the net weight for piece 1')
  })

  it('uppercases and dedupes HUIDs', () => {
    const input = formToProductInput(form({ huids: [' a1b2c3 ', 'A1B2C3', '', 'd4e5f6'] }))
    expect(input.huids).toEqual(['A1B2C3', 'D4E5F6'])
  })
})

describe('productInputForSource', () => {
  it('save from the products page keeps stock, HUIDs and the tracking choice', () => {
    const input = productInputForSource(form({ trackPieces: false }), 'products')
    expect(input.stockQty).toBe(4)
    expect(input.huids).toEqual(['AA0001', 'AA0002', 'AA0003', 'AA0004'])
    expect(input.trackPieces).toBe(false)
  })

  it('save from a purchase line starts with no stock and tracks pieces', () => {
    const input = productInputForSource(form(), 'purchase')
    expect(input.stockQty).toBe(0)
    expect(input.huids).toEqual([])
    expect(input.trackPieces).toBe(true)
    expect(input.name).toBe('Gold chain')
    expect(input.netWeight).toBe(9)
  })
})

describe('existing piece edits', () => {
  function pieceRow(overrides: Partial<ExistingPieceEditRow> = {}): ExistingPieceEditRow {
    return {
      id: 1,
      tagCode: 'T000001',
      status: 'in_stock',
      huid: 'ABC123',
      grossWeight: 2.5,
      stoneWeight: 0.2,
      netWeight: 2.3,
      cost: 1000,
      editable: true,
      ...overrides,
    }
  }

  it('validates editable rows and ignores sold rows', () => {
    expect(
      validateExistingPieceEdits([
        pieceRow(),
        pieceRow({ id: 2, tagCode: 'T000002', status: 'sold', editable: false, netWeight: 0 }),
      ]),
    ).toBeUndefined()
    expect(validateExistingPieceEdits([pieceRow({ netWeight: '' })])).toBe(
      'Enter the net weight for T000001',
    )
    expect(
      validateExistingPieceEdits([
        pieceRow({ huid: 'SAME' }),
        pieceRow({ id: 2, tagCode: 'T000002', huid: 'same' }),
      ]),
    ).toBe('HUID SAME is duplicated')
  })

  it('maps only editable rows for the update API', () => {
    expect(
      existingPiecesToUpdateInput([
        pieceRow({ cost: '' }),
        pieceRow({ id: 2, tagCode: 'T000002', status: 'sold', editable: false }),
      ]),
    ).toEqual([
      {
        id: 1,
        huid: 'ABC123',
        grossWeight: 2.5,
        stoneWeight: 0.2,
        netWeight: 2.3,
        cost: null,
      },
    ])
  })
})

describe('productMatchesListContext', () => {
  it('matches search, metal chip, and stock tone', () => {
    const input = formToProductInput(form())
    expect(
      productMatchesListContext(input, {
        search: 'chain',
        metal: 'gold',
        category: 'all',
        purity: 'all',
        stockStatus: 'low',
      }),
    ).toBe(true)
    expect(
      productMatchesListContext(input, {
        search: '',
        metal: 'silver',
        category: 'all',
        purity: 'all',
        stockStatus: 'all',
      }),
    ).toBe(false)
  })
})
