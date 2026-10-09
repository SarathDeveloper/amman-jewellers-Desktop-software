import { describe, expect, it } from 'vitest'
import { EMPTY_PRODUCT_VARIANT_FIELDS } from '../../shared/types'
import type { Product } from '../../shared/types'
import {
  categoryOptions,
  defaultPurityForMetal,
  emptyProductForm,
  formToProductInput,
  metalOptions,
  productMatchesListContext,
  purityOptions,
  resolvePurityForMetal,
  validateProductForm,
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

  it('rejects a 5-character HUID', () => {
    const errors = validateProductForm(form({ huids: ['A1B2C'] }), [], null)
    expect(errors.huids).toBe('HUID must be 6 letters or digits')
  })

  it('rejects a duplicated HUID in the form', () => {
    const errors = validateProductForm(form({ huids: ['a1b2c3', 'A1B2C3'] }), [], null)
    expect(errors.huids).toBe('HUID A1B2C3 is duplicated')
  })

  it('requires one HUID per piece in stock', () => {
    const errors = validateProductForm(form({ stockQty: 2, huids: ['A1B2C3'] }), [], null)
    expect(errors.huids).toBe('Add one HUID for each piece in stock')
  })

  it('lets silver pieces stay untagged but not exceed the piece count', () => {
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

  it('uppercases and dedupes HUIDs', () => {
    const input = formToProductInput(form({ huids: [' a1b2c3 ', 'A1B2C3', '', 'd4e5f6'] }))
    expect(input.huids).toEqual(['A1B2C3', 'D4E5F6'])
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
