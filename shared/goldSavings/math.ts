/** Integer milligrams — 3 decimal grams. Never divide floats for gold weight. */
export const GOLD_WEIGHT_DECIMALS = 3
const MG_PER_GRAM = 1000
const PAISE_PER_RUPEE = 100

export function toPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE)
}

export function fromPaise(paise: number): number {
  return paise / PAISE_PER_RUPEE
}

export function roundMoney(rupees: number): number {
  return fromPaise(toPaise(rupees))
}

export function toMilligrams(grams: number): number {
  return Math.round(grams * MG_PER_GRAM)
}

export function fromMilligrams(mg: number): number {
  return mg / MG_PER_GRAM
}

export function roundGoldGrams(grams: number): number {
  return fromMilligrams(toMilligrams(grams))
}

/**
 * Gold weight in grams = installment amount / gold rate per gram.
 * Uses integer paise and milligrams so 2000 / 10000 = 0.200 g exactly.
 */
export function goldWeightFromAmount(amountRupees: number, ratePerGram: number): number {
  const amountPaise = toPaise(amountRupees)
  const ratePaise = toPaise(ratePerGram)
  if (ratePaise <= 0) {
    throw new Error('Gold rate must be greater than zero')
  }
  if (amountPaise <= 0) {
    return 0
  }
  const milligrams = Math.round((amountPaise * MG_PER_GRAM) / ratePaise)
  return fromMilligrams(milligrams)
}

export function addCalendarMonths(isoDate: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!match) {
    throw new Error('Invalid date')
  }
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const cursor = new Date(year, monthIndex + months, 1)
  const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const clamped = Math.min(day, lastDay)
  const y = cursor.getFullYear()
  const m = String(cursor.getMonth() + 1).padStart(2, '0')
  const d = String(clamped).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const MS_PER_DAY = 86_400_000

/**
 * Late fee for a payment, counted in calendar days after the due date and the
 * scheme grace period. `fixed` charges once, `per_day` multiplies the value by
 * the late days. Never negative; a payment inside the grace window is free.
 */
export function computeLateFee(input: {
  dueDate: string
  paymentDate: string
  graceDays: number
  type: string
  value: number
}): number {
  if (input.type === 'none' || input.value <= 0) return 0
  const due = Date.parse(`${input.dueDate}T00:00:00Z`)
  const paid = Date.parse(`${input.paymentDate}T00:00:00Z`)
  if (Number.isNaN(due) || Number.isNaN(paid)) return 0
  const rawDays = Math.floor((paid - due) / MS_PER_DAY)
  const daysLate = rawDays - Math.max(0, input.graceDays)
  if (daysLate <= 0) return 0
  if (input.type === 'fixed') return roundMoney(input.value)
  return roundMoney(input.value * daysLate)
}

export function rateForPurity(
  rates: { gold22k: number; gold24k: number; gold18k: number },
  purity: string,
): number {
  if (purity === '24K') return rates.gold24k
  if (purity === '18K') return rates.gold18k
  return rates.gold22k
}

/** Bonus grams from scheme configuration. Never invent an entitlement here. */
export function eligibleBonusGoldWeight(input: {
  bonusType: string
  bonusValue: number
  accumulatedGrams: number
  paidInstallments: number
  durationMonths: number
  ratePerGram?: number
}): number {
  if (input.paidInstallments < input.durationMonths) return 0
  if (input.bonusType === 'none' || input.bonusValue <= 0) return 0
  if (input.bonusType === 'additional_gold') return roundGoldGrams(input.bonusValue)
  if (input.bonusType === 'percentage') {
    return roundGoldGrams((input.accumulatedGrams * input.bonusValue) / 100)
  }
  if (input.bonusType === 'fixed_amount') {
    const rate = input.ratePerGram ?? 0
    if (rate <= 0) return 0
    return goldWeightFromAmount(input.bonusValue, rate)
  }
  return 0
}
