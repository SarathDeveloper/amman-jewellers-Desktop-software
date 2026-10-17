import { describe, expect, it } from 'vitest'
import { allocatePieceCosts } from '../../shared/billing/pieceCosts'

describe('allocatePieceCosts', () => {
  it('costs each piece from its own net weight plus making', () => {
    expect(
      allocatePieceCosts({
        netWeights: [2, 3],
        rate: 1000,
        makingCharges: 200,
        lineDiscount: 0,
      }),
    ).toEqual([2200, 3200])
  })

  it('spreads the line discount in proportion to each piece base cost', () => {
    expect(
      allocatePieceCosts({
        netWeights: [2, 3],
        rate: 1000,
        makingCharges: 100,
        lineDiscount: 520,
      }),
    ).toEqual([1890, 2790])
  })

  it('never lets a discount push a piece cost below zero', () => {
    expect(
      allocatePieceCosts({
        netWeights: [1, 1],
        rate: 100,
        makingCharges: 0,
        lineDiscount: 500,
      }),
    ).toEqual([0, 0])
  })

  it('returns no costs when the line has no piece rows', () => {
    expect(
      allocatePieceCosts({ netWeights: [], rate: 1000, makingCharges: 0, lineDiscount: 0 }),
    ).toEqual([])
  })
})
