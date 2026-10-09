import type { MetalRates } from '../types'

/** Purity label used by a gold item, derived from the shop's latest rates. */
const GOLD_PURITY_KARAT: Record<string, number> = {
  '24K': 24,
  '22K': 22,
  '20K': 20,
  '18K': 18,
  '14K': 14,
}

const SILVER_PURITY_FINENESS: Record<string, number> = {
  '999': 999,
  FINE: 999,
  '925': 925,
  '900': 900,
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function isGold(metal: string): boolean {
  return metal.trim().toLowerCase().startsWith('gold')
}

function isSilver(metal: string): boolean {
  return metal.trim().toLowerCase().startsWith('silver')
}

function goldRate24k(rates: MetalRates): number {
  if (rates.gold24k > 0) return rates.gold24k
  if (rates.gold22k > 0) return round2(rates.gold22k * (24 / 22))
  return 0
}

function silverFineRate(rates: MetalRates): number {
  if (rates.silverFine > 0) return rates.silverFine
  if (rates.silver925 > 0) return round2(rates.silver925 * (999 / 925))
  return 0
}

/**
 * Rate per gram for an item at the latest rates.
 *
 * Gold 24K/22K/18K/20K have their own rates; 14K and any other karat is derived
 * from the 24K rate. Silver 999 uses the fine rate, 925 its own, and 900 is
 * derived from the fine rate.
 */
export function ratePerGram(
  rates: MetalRates | null | undefined,
  metal: string,
  purity: string,
): number {
  if (!rates) return 0
  const label = purity.trim().toUpperCase()

  if (isGold(metal)) {
    const karat = GOLD_PURITY_KARAT[label]
    if (!karat) return 0
    if (karat === 24) return goldRate24k(rates)
    if (karat === 22 && rates.gold22k > 0) return rates.gold22k
    if (karat === 20 && rates.gold20k > 0) return rates.gold20k
    if (karat === 18 && rates.gold18k > 0) return rates.gold18k
    return round2(goldRate24k(rates) * (karat / 24))
  }

  if (isSilver(metal)) {
    const fineness = SILVER_PURITY_FINENESS[label]
    if (!fineness) return 0
    if (fineness === 925 && rates.silver925 > 0) return rates.silver925
    return round2(silverFineRate(rates) * (fineness / 999))
  }

  return 0
}

/** Value of a single item: its rate per gram times its net weight. */
export function itemValue(
  rates: MetalRates | null | undefined,
  metal: string,
  purity: string,
  netWeight: number,
): number {
  const rate = ratePerGram(rates, metal, purity)
  if (rate <= 0 || netWeight <= 0) return 0
  return round2(rate * netWeight)
}

export type ValuationItem = {
  metal: string
  purity: string
  netWeight: number
}

/** Sum of every item's value at the running rates. */
export function assessedValueFromItems(
  rates: MetalRates | null | undefined,
  items: ValuationItem[],
): number {
  return round2(
    items.reduce(
      (sum, item) => sum + itemValue(rates, item.metal, item.purity, item.netWeight),
      0,
    ),
  )
}

/** Maximum sanctioned loan for an assessed value at the shop's LTV percent. */
export function maxLoanForValue(assessedValue: number, ltvPct: number): number {
  const pct = Math.min(100, Math.max(0, Number.isFinite(ltvPct) ? ltvPct : 0))
  return round2(Math.max(0, assessedValue) * (pct / 100))
}

export function isAboveLtv(loanAmount: number, assessedValue: number, ltvPct: number): boolean {
  if (assessedValue <= 0) return false
  return loanAmount > maxLoanForValue(assessedValue, ltvPct) + 0.01
}
