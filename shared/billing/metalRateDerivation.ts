export const GOLD_KARATS = [24, 22, 20, 18] as const
export type GoldKarat = (typeof GOLD_KARATS)[number]

export const SILVER_FINENESS = [999, 925] as const
export type SilverFineness = (typeof SILVER_FINENESS)[number]

export type DerivedGoldRates = {
  gold24k: number
  gold22k: number
  gold20k: number
  gold18k: number
}

export type DerivedSilverRates = {
  silverFine: number
  silver925: number
}

function roundRate(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatPurityPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

export function goldPurityPercent(karat: GoldKarat): string {
  return formatPurityPercent((karat / 24) * 100)
}

export function silverPurityPercent(fineness: SilverFineness): string {
  return formatPurityPercent((fineness / 1000) * 100)
}

export function deriveGoldRates(karat: GoldKarat, value: number): DerivedGoldRates {
  const base24 = value * (24 / karat)
  return {
    gold24k: roundRate(base24),
    gold22k: roundRate(base24 * (22 / 24)),
    gold20k: roundRate(base24 * (20 / 24)),
    gold18k: roundRate(base24 * (18 / 24)),
  }
}

export function deriveSilverRates(fineness: SilverFineness, value: number): DerivedSilverRates {
  const base999 = value * (999 / fineness)
  return {
    silverFine: roundRate(base999),
    silver925: roundRate(base999 * (925 / 999)),
  }
}
