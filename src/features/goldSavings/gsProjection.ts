import {
  eligibleBonusGoldWeight,
  fromMilligrams,
  goldWeightFromAmount,
  toMilligrams,
} from '@shared/goldSavings/math'
import type { GoldSavingScheme } from '@shared/types'

export function isoDaysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00`)
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.round((to - from) / 86_400_000)
}

export function progressPct(part: number, whole: number): number {
  if (whole <= 0) return part > 0 ? 100 : 0
  return Math.round((part / whole) * 100)
}

export function projectedGoldAtRate(input: {
  accumulatedGrams: number
  remainingInstallments: number
  monthlyAmount: number
  ratePerGram: number
}): number {
  const remainingMg =
    input.remainingInstallments > 0 && input.monthlyAmount > 0 && input.ratePerGram > 0
      ? toMilligrams(goldWeightFromAmount(input.monthlyAmount, input.ratePerGram)) * input.remainingInstallments
      : 0
  return fromMilligrams(toMilligrams(input.accumulatedGrams) + remainingMg)
}

export function currentBonusGold(input: {
  scheme: GoldSavingScheme
  accumulatedGrams: number
  paidInstallments: number
  durationMonths: number
  ratePerGram: number
}): number {
  return eligibleBonusGoldWeight({
    bonusType: input.scheme.bonusType,
    bonusValue: input.scheme.bonusValue,
    accumulatedGrams: input.accumulatedGrams,
    paidInstallments: input.paidInstallments,
    durationMonths: input.durationMonths,
    ratePerGram: input.ratePerGram,
  })
}

export function projectedBonusGold(input: {
  scheme: GoldSavingScheme
  accumulatedGrams: number
  remainingInstallments: number
  monthlyAmount: number
  durationMonths: number
  ratePerGram: number
}): number {
  if (input.scheme.bonusType === 'none' || input.scheme.bonusValue <= 0) return 0
  const projectedAccumulated = projectedGoldAtRate({
    accumulatedGrams: input.accumulatedGrams,
    remainingInstallments: input.remainingInstallments,
    monthlyAmount: input.monthlyAmount,
    ratePerGram: input.ratePerGram,
  })
  return eligibleBonusGoldWeight({
    bonusType: input.scheme.bonusType,
    bonusValue: input.scheme.bonusValue,
    accumulatedGrams: projectedAccumulated,
    paidInstallments: input.durationMonths,
    durationMonths: input.durationMonths,
    ratePerGram: input.ratePerGram,
  })
}

export function bonusConditionText(scheme: GoldSavingScheme, paidInstallments: number, durationMonths: number): string {
  if (scheme.bonusType === 'none' || scheme.bonusValue <= 0) {
    return 'No bonus is configured on this scheme.'
  }
  const remaining = Math.max(0, durationMonths - paidInstallments)
  if (scheme.bonusEligibility.trim()) {
    return remaining > 0
      ? `${scheme.bonusEligibility} · ${remaining} installment${remaining === 1 ? '' : 's'} remaining.`
      : scheme.bonusEligibility
  }
  if (remaining > 0) {
    return `Pay all ${durationMonths} installments to earn bonus. ${remaining} remaining.`
  }
  return 'All installments paid. Bonus is eligible at redemption.'
}
