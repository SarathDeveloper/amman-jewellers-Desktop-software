import { describe, expect, it } from 'vitest'
import type { GoldSavingScheme } from '../../shared/types'
import { bonusConditionText, isoDaysBetween, progressPct, projectedBonusGold, projectedGoldAtRate } from '../../src/features/goldSavings/gsProjection'

const scheme = {
  bonusType: 'additional_gold',
  bonusValue: 1,
  bonusEligibility: '',
} as GoldSavingScheme

describe('gsProjection', () => {
  it('computes calendar-day gaps from ISO dates', () => {
    expect(isoDaysBetween('2026-10-01', '2026-10-11')).toBe(10)
  })

  it('caps progress at whole-number percent', () => {
    expect(progressPct(7, 11)).toBe(64)
    expect(progressPct(0, 0)).toBe(0)
  })

  it('projects remaining gold at the current rate', () => {
    expect(
      projectedGoldAtRate({
        accumulatedGrams: 0.2,
        remainingInstallments: 10,
        monthlyAmount: 2000,
        ratePerGram: 10000,
      }),
    ).toBe(2.2)
  })

  it('projects remaining gold without float drift', () => {
    expect(
      projectedGoldAtRate({
        accumulatedGrams: 0.333,
        remainingInstallments: 3,
        monthlyAmount: 3333,
        ratePerGram: 10000,
      }),
    ).toBe(1.332)
  })

  it('projects additional-gold bonus only as if the scheme is completed', () => {
    expect(
      projectedBonusGold({
        scheme,
        accumulatedGrams: 0.4,
        remainingInstallments: 9,
        monthlyAmount: 2000,
        durationMonths: 11,
        ratePerGram: 10000,
      }),
    ).toBe(1)
    expect(bonusConditionText(scheme, 2, 11)).toMatch(/9 remaining/)
  })
})
