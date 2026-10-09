import { describe, expect, it } from 'vitest'
import type { MetalRates } from '@shared/types'
import {
  assessedValueFromItems,
  isAboveLtv,
  itemValue,
  maxLoanForValue,
  ratePerGram,
} from '@shared/billing/pledgeValuation'

const rates: MetalRates = {
  id: 1,
  effectiveDate: '2026-08-01',
  gold22k: 6000,
  gold24k: 6500,
  gold20k: 5400,
  gold18k: 4900,
  silverFine: 80,
  silver925: 75,
  createdAt: '2026-08-01T00:00:00.000Z',
}

describe('ratePerGram', () => {
  it('uses the karat rates the shop publishes', () => {
    expect(ratePerGram(rates, 'Gold', '24K')).toBe(6500)
    expect(ratePerGram(rates, 'Gold', '22K')).toBe(6000)
    expect(ratePerGram(rates, 'Gold', '20K')).toBe(5400)
    expect(ratePerGram(rates, 'Gold', '18K')).toBe(4900)
  })

  it('derives 14K gold from the 24K rate', () => {
    expect(ratePerGram(rates, 'Gold', '14K')).toBe(3791.67)
  })

  it('uses fine and 925 silver rates and derives 900', () => {
    expect(ratePerGram(rates, 'Silver', '999')).toBe(80)
    expect(ratePerGram(rates, 'Silver', '925')).toBe(75)
    expect(ratePerGram(rates, 'Silver', '900')).toBe(72.07)
  })

  it('returns 0 for unknown metal, purity, or missing rates', () => {
    expect(ratePerGram(rates, 'Platinum', '24K')).toBe(0)
    expect(ratePerGram(rates, 'Gold', '10K')).toBe(0)
    expect(ratePerGram(null, 'Gold', '22K')).toBe(0)
  })

  it('derives a missing karat from 24K and a missing silver rate from fine', () => {
    const sparse: MetalRates = {
      ...rates,
      gold22k: 0,
      gold20k: 0,
      gold18k: 0,
      silver925: 0,
    }
    expect(ratePerGram(sparse, 'Gold', '22K')).toBe(5958.33)
    expect(ratePerGram(sparse, 'Silver', '925')).toBe(74.07)
  })
})

describe('item valuation', () => {
  it('multiplies the rate by net weight', () => {
    expect(itemValue(rates, 'Gold', '22K', 10)).toBe(60000)
    expect(itemValue(rates, 'Gold', '22K', 0)).toBe(0)
  })

  it('sums every item into the assessed value', () => {
    const total = assessedValueFromItems(rates, [
      { metal: 'Gold', purity: '22K', netWeight: 10 },
      { metal: 'Silver', purity: '925', netWeight: 100 },
    ])
    expect(total).toBe(67500)
  })

  it('computes the max loan at the LTV percent', () => {
    expect(maxLoanForValue(60000, 75)).toBe(45000)
    expect(maxLoanForValue(60000, 0)).toBe(0)
  })

  it('flags loans above the LTV limit', () => {
    expect(isAboveLtv(45000, 60000, 75)).toBe(false)
    expect(isAboveLtv(45001, 60000, 75)).toBe(true)
    expect(isAboveLtv(9000, 0, 75)).toBe(false)
  })
})
