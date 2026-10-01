import { describe, expect, it } from 'vitest'
import { addCalendarMonths, eligibleBonusGoldWeight, goldWeightFromAmount, roundMoney } from '../../shared/goldSavings/math'

describe('goldWeightFromAmount', () => {
  it('credits 0.200 g for ₹2000 at ₹10000 per gram using integer milligrams', () => {
    expect(goldWeightFromAmount(2000, 10000)).toBe(0.2)
  })

  it('does not use binary float drift for typical jewelry amounts', () => {
    expect(goldWeightFromAmount(2500, 12500)).toBe(0.2)
    expect(goldWeightFromAmount(3333, 10000)).toBe(0.333)
  })
})

describe('eligibleBonusGoldWeight', () => {
  it('returns zero until all installments are paid', () => {
    expect(
      eligibleBonusGoldWeight({
        bonusType: 'additional_gold',
        bonusValue: 1,
        accumulatedGrams: 2,
        paidInstallments: 10,
        durationMonths: 11,
      }),
    ).toBe(0)
  })

  it('applies configured additional gold only after completion', () => {
    expect(
      eligibleBonusGoldWeight({
        bonusType: 'additional_gold',
        bonusValue: 1,
        accumulatedGrams: 2,
        paidInstallments: 11,
        durationMonths: 11,
      }),
    ).toBe(1)
  })

  it('applies a percentage of accumulated gold from scheme config', () => {
    expect(
      eligibleBonusGoldWeight({
        bonusType: 'percentage',
        bonusValue: 10,
        accumulatedGrams: 2,
        paidInstallments: 11,
        durationMonths: 11,
      }),
    ).toBe(0.2)
  })
})

describe('goldWeightFromAmount', () => {
  it('credits 0.200 g for ₹2000 at ₹10000 per gram using integer milligrams', () => {
    expect(goldWeightFromAmount(2000, 10000)).toBe(0.2)
  })

  it('does not use binary float drift for typical jewelry amounts', () => {
    expect(goldWeightFromAmount(2500, 12500)).toBe(0.2)
    expect(goldWeightFromAmount(3333, 10000)).toBe(0.333)
  })
})

describe('addCalendarMonths', () => {
  it('clamps end-of-month dates', () => {
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addCalendarMonths('2026-01-15', 10)).toBe('2026-11-15')
  })
})

describe('roundMoney', () => {
  it('rounds to paise', () => {
    expect(roundMoney(10.005)).toBe(10.01)
  })
})
