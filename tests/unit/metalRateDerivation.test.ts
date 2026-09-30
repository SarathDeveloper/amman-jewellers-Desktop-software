import { describe, expect, it } from 'vitest'
import {
  deriveGoldRates,
  deriveSilverRates,
  goldPurityPercent,
  silverPurityPercent,
} from '../../shared/billing/metalRateDerivation'

describe('metalRateDerivation', () => {
  it('derives 22K, 20K, and 18K from 24K 16500', () => {
    expect(deriveGoldRates(24, 16500)).toEqual({
      gold24k: 16500,
      gold22k: 15125,
      gold20k: 13750,
      gold18k: 12375,
    })
  })

  it('back-solves the same gold set from 18K', () => {
    expect(deriveGoldRates(18, 12375)).toEqual({
      gold24k: 16500,
      gold22k: 15125,
      gold20k: 13750,
      gold18k: 12375,
    })
  })

  it('back-solves the same gold set from 22K', () => {
    expect(deriveGoldRates(22, 15125)).toEqual({
      gold24k: 16500,
      gold22k: 15125,
      gold20k: 13750,
      gold18k: 12375,
    })
  })

  it('derives 925 silver from 999 at 250', () => {
    expect(deriveSilverRates(999, 250)).toEqual({
      silverFine: 250,
      silver925: 231.48,
    })
  })

  it('back-solves 999 silver from 925', () => {
    expect(deriveSilverRates(925, 231.48)).toEqual({
      silverFine: 250,
      silver925: 231.48,
    })
  })

  it('formats purity percents used on the rate cards', () => {
    expect(goldPurityPercent(24)).toBe('100%')
    expect(goldPurityPercent(22)).toBe('91.7%')
    expect(goldPurityPercent(20)).toBe('83.3%')
    expect(goldPurityPercent(18)).toBe('75%')
    expect(silverPurityPercent(999)).toBe('99.9%')
    expect(silverPurityPercent(925)).toBe('92.5%')
  })
})
