import { describe, expect, it } from 'vitest'
import { EMPTY_PRODUCT_VARIANT_FIELDS, type Product } from '../../shared/types'
import {
  effectiveStockQty,
  sellableProducts,
  variantDisplayName,
} from '../../src/features/products/productDisplay'

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Gold Ring',
    category: 'Ring',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 2.7,
    netWeight: 2.5,
    makingCharges: 400,
    stockQty: 1,
    imagePath: '',
    updatedAt: '2026-01-01',
    ...EMPTY_PRODUCT_VARIANT_FIELDS,
    ...overrides,
  }
}

describe('variantDisplayName', () => {
  it('joins name, weight, and size', () => {
    expect(variantDisplayName(product({ size: '16' }))).toBe('Gold Ring / 2.5g / Size 16')
  })

  it('omits empty weight and size', () => {
    expect(variantDisplayName(product({ netWeight: 0, size: '' }))).toBe('Gold Ring')
  })
})

describe('sellableProducts', () => {
  it('hides empty parent designs that have variants', () => {
    const parent = product({ id: 1, netWeight: 0, size: '', variantCode: '', stockQty: 0 })
    const child = product({ id: 2, parentId: 1, size: '16' })
    expect(sellableProducts([parent, child]).map((row) => row.id)).toEqual([2])
  })

  it('keeps a parent piece that has its own weight and size', () => {
    const parent = product({ id: 8, name: 'Oxidised Chain', netWeight: 22, size: '20', stockQty: 6 })
    const child = product({
      id: 12,
      parentId: 8,
      name: 'Oxidised Chain',
      netWeight: 18,
      size: '18',
      stockQty: 3,
    })
    expect(sellableProducts([parent, child]).map((row) => row.id)).toEqual([8, 12])
  })
})

describe('effectiveStockQty', () => {
  it('adds parent stock to child stock', () => {
    const parent = product({ id: 8, stockQty: 6 })
    const child = product({ id: 12, parentId: 8, stockQty: 3 })
    expect(effectiveStockQty(parent, [parent, child])).toBe(9)
  })
})
