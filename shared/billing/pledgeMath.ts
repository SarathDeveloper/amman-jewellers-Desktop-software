import { roundMoney } from './pricing'

/** Simple monthly interest: principal × (rate/100) × (days/30). */
export function computePledgeInterest(
  principal: number,
  interestPctPerMonth: number,
  fromDate: string,
  asOfDate: string,
): number {
  const days = daysBetween(fromDate, asOfDate)
  if (days <= 0 || principal <= 0 || interestPctPerMonth <= 0) return 0
  const months = days / 30
  return roundMoney(principal * (interestPctPerMonth / 100) * months)
}

/** One month of interest at the given monthly rate (%). */
export function monthlyPledgeInterestAmount(
  principal: number,
  interestPctPerMonth: number,
): number {
  if (principal <= 0 || interestPctPerMonth <= 0) return 0
  return roundMoney(principal * (interestPctPerMonth / 100))
}

/** Principal plus interest from pledge date through pledge date + 365 days. */
export function totalPayableAfterOneYear(
  principal: number,
  interestPctPerMonth: number,
  pledgeDate: string,
): number {
  if (principal <= 0) return 0
  const interest = computePledgeInterest(
    principal,
    interestPctPerMonth,
    pledgeDate,
    maxRepaymentDueDate(pledgeDate),
  )
  return roundMoney(principal + interest)
}

export function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T12:00:00`)
  const to = Date.parse(`${toDate}T12:00:00`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.floor((to - from) / (24 * 60 * 60 * 1000)))
}

export function suggestedLoanAmount(assessedValue: number, ltvPct: number): number {
  if (assessedValue <= 0 || ltvPct <= 0) return 0
  return roundMoney(assessedValue * (ltvPct / 100))
}

/** Cash disbursed after upfront charges: max(0, sanctioned − charges). */
export function netPaidAmount(loanAmount: number, charges: number): number {
  return roundMoney(Math.max(0, loanAmount - Math.max(0, charges)))
}

export function addDaysIso(isoDate: string, days: number): string {
  const start = Date.parse(`${isoDate}T12:00:00`)
  if (Number.isNaN(start)) return isoDate
  const next = new Date(start + days * 24 * 60 * 60 * 1000)
  return next.toISOString().slice(0, 10)
}

export function defaultRepaymentDueDate(pledgeDate: string): string {
  return addDaysIso(pledgeDate, 365)
}

/** Latest allowed repayment due date: fromDate + 365 days. */
export function maxRepaymentDueDate(fromDate: string): string {
  return addDaysIso(fromDate, 365)
}

/** Clamp due date into [fromDate, fromDate+365]. */
export function clampRepaymentDueDate(dueDate: string, fromDate: string): string {
  const min = fromDate
  const max = maxRepaymentDueDate(fromDate)
  if (!dueDate || dueDate < min) return min
  if (dueDate > max) return max
  return dueDate
}

const ADG_PREFIX = 'ADG'

/** Format unique Adagu bill no: ADG0001, ADG0002, … (width grows past 9999). */
export function formatAdgReceiptNo(seq: number): string {
  const n = Math.max(1, Math.floor(seq))
  return `${ADG_PREFIX}${String(n).padStart(4, '0')}`
}

export function parseAdgSeq(receiptNo: string): number | null {
  const match = /^ADG(\d+)$/i.exec(receiptNo.trim())
  if (!match) return null
  const n = Number.parseInt(match[1], 10)
  return Number.isFinite(n) ? n : null
}

/** Next interest due = pledge date + N×30 days where N is the next period after asOf. */
export function nextInterestDueDate(pledgeDate: string, asOfDate: string): string {
  const start = Date.parse(`${pledgeDate}T12:00:00`)
  const asOf = Date.parse(`${asOfDate}T12:00:00`)
  if (Number.isNaN(start)) return pledgeDate
  const dayMs = 24 * 60 * 60 * 1000
  const elapsed = Number.isNaN(asOf) ? 0 : Math.max(0, Math.floor((asOf - start) / dayMs))
  const periodsElapsed = Math.floor(elapsed / 30)
  const nextPeriod = periodsElapsed + 1
  const next = new Date(start + nextPeriod * 30 * dayMs)
  return next.toISOString().slice(0, 10)
}

export function pledgeAmountDue(
  principal: number,
  interestPctPerMonth: number,
  pledgeDate: string,
  asOfDate: string,
  amountCollected: number,
): {
  days: number
  interest: number
  totalDue: number
  remaining: number
} {
  const days = daysBetween(pledgeDate, asOfDate)
  const interest = computePledgeInterest(principal, interestPctPerMonth, pledgeDate, asOfDate)
  const totalDue = roundMoney(principal + interest)
  const remaining = roundMoney(Math.max(0, totalDue - amountCollected))
  return { days, interest, totalDue, remaining }
}

export type PledgeTopupSlice = {
  amount: number
  topupDate: string
  interestPct: number
}

/** Original sanctioned amount plus later top-ups on the same items. */
export function totalPrincipalWithTopups(
  baseLoanAmount: number,
  topups: Array<{ amount: number }>,
): number {
  return roundMoney(baseLoanAmount + topups.reduce((sum, item) => sum + item.amount, 0))
}

/**
 * Interest on the original principal from pledge date, plus interest on each
 * top-up from the date it was disbursed.
 */
export function pledgeAmountDueWithTopups(
  basePrincipal: number,
  topups: PledgeTopupSlice[],
  baseInterestPct: number,
  pledgeDate: string,
  asOfDate: string,
  amountCollected: number,
): {
  days: number
  interest: number
  totalDue: number
  remaining: number
  principal: number
  monthlyInterest: number
} {
  const principal = totalPrincipalWithTopups(basePrincipal, topups)
  const baseInterest = computePledgeInterest(basePrincipal, baseInterestPct, pledgeDate, asOfDate)
  const extraInterest = topups.reduce(
    (sum, topup) =>
      sum + computePledgeInterest(topup.amount, topup.interestPct, topup.topupDate, asOfDate),
    0,
  )
  const interest = roundMoney(baseInterest + extraInterest)
  const totalDue = roundMoney(principal + interest)
  const remaining = roundMoney(Math.max(0, totalDue - amountCollected))
  const monthlyInterest = roundMoney(
    monthlyPledgeInterestAmount(basePrincipal, baseInterestPct) +
      topups.reduce(
        (sum, topup) => sum + monthlyPledgeInterestAmount(topup.amount, topup.interestPct),
        0,
      ),
  )
  return {
    days: daysBetween(pledgeDate, asOfDate),
    interest,
    totalDue,
    remaining,
    principal,
    monthlyInterest,
  }
}

/** True once at least one 30-day interest period has elapsed. */
export function isInterestPeriodDue(pledgeDate: string, asOfDate: string): boolean {
  return daysBetween(pledgeDate, asOfDate) >= 30
}
