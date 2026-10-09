import { addDaysIso, daysBetween } from './pledgeMath'
import { roundMoney } from './pricing'

/**
 * Adagu interest ledger.
 *
 * Interest is charged per 30-day period with a minimum of one month:
 * - the first period always costs a full month, including a same-day close
 *   (day 0 pays one month, because no days have to elapse to trigger it);
 * - after that a part-period of 1-15 days costs half a month and 16-29 days a
 *   full month.
 *
 * The original loan and every top-up are separate "tranches". Each tranche keeps
 * its own interest-paid-up-to date, so a top-up only accrues interest from the
 * day it was disbursed. Payments are replayed in order, so the result is
 * deterministic and can be rebuilt from the stored rows at any time.
 */

const EPSILON = 1e-9
const PERIOD_DAYS = 30

export type PledgeLedgerTrancheInput = {
  amount: number
  rate: number
  date: string
}

export type PledgeLedgerPaymentInput = {
  date: string
  amount: number
  discount?: number
}

export type PledgeLedgerTranche = {
  amount: number
  rate: number
  date: string
  paidUpto: string
}

export type PledgePaymentAllocation = {
  date: string
  amount: number
  discount: number
  interestPart: number
  principalPart: number
  discountApplied: number
  coversInterest: boolean
}

export type PledgeLedgerResult = {
  originalPrincipal: number
  principalOutstanding: number
  /** Interest matched to fully paid 30-day periods. */
  assessedInterest: number
  /** Interest accrued since the last paid period, before any credit. */
  currentInterest: number
  /** Interest money received but not yet matched to a period. */
  interestCredit: number
  interestDue: number
  totalDiscount: number
  /** Total cost of the loan to date: principal + interest - discounts. */
  grossDue: number
  payoff: number
  interestPaidUpto: string
  nextInterestDue: string
  isInterestOverdue: boolean
  monthlyInterest: number
  overpayment: number
  tranches: PledgeLedgerTranche[]
  allocations: PledgePaymentAllocation[]
}

/** Part-month count for a period that already had its first month. */
export function partMonthMonths(days: number): number {
  if (days <= 0) return 0
  const full = Math.floor(days / PERIOD_DAYS)
  const remainder = days % PERIOD_DAYS
  if (remainder >= 1 && remainder <= 15) return full + 0.5
  if (remainder >= 16) return full + 1
  return full
}

/** Months to charge for `days` elapsed in the current period. */
export function interestMonths(days: number, isFirstPeriod: boolean): number {
  if (days < 0) return 0
  if (isFirstPeriod) {
    // The minimum-month rule applies from day 0: a same-day charge still costs
    // one full month, so only a negative span (never charged) escapes it.
    if (days <= PERIOD_DAYS) return 1
    return 1 + partMonthMonths(days - PERIOD_DAYS)
  }
  return partMonthMonths(days)
}

function trancheAccrual(tranche: PledgeLedgerTranche, asOfDate: string): {
  months: number
  interest: number
} {
  if (tranche.amount <= 0 || tranche.rate <= 0) return { months: 0, interest: 0 }
  if (tranche.date > asOfDate) return { months: 0, interest: 0 }
  const days = daysBetween(tranche.paidUpto, asOfDate)
  const months = interestMonths(days, tranche.paidUpto === tranche.date)
  const interest = roundMoney(tranche.amount * (tranche.rate / 100) * months)
  return { months, interest }
}

function applyToPrincipal(
  tranches: PledgeLedgerTranche[],
  cash: number,
  discount: number,
): { cashApplied: number; discountApplied: number } {
  let remainingCash = Math.max(0, cash)
  let remainingDiscount = Math.max(0, discount)
  let cashApplied = 0
  let discountApplied = 0
  for (const tranche of tranches) {
    if (remainingCash > EPSILON && tranche.amount > EPSILON) {
      const pay = Math.min(tranche.amount, remainingCash)
      tranche.amount = roundMoney(tranche.amount - pay)
      remainingCash = roundMoney(remainingCash - pay)
      cashApplied = roundMoney(cashApplied + pay)
    }
    if (remainingDiscount > EPSILON && tranche.amount > EPSILON) {
      const waive = Math.min(tranche.amount, remainingDiscount)
      tranche.amount = roundMoney(tranche.amount - waive)
      remainingDiscount = roundMoney(remainingDiscount - waive)
      discountApplied = roundMoney(discountApplied + waive)
    }
    if (remainingCash <= EPSILON && remainingDiscount <= EPSILON) break
  }
  return { cashApplied, discountApplied }
}

export function replayPledge(input: {
  base: PledgeLedgerTrancheInput
  topups?: PledgeLedgerTrancheInput[]
  payments?: PledgeLedgerPaymentInput[]
  asOfDate: string
}): PledgeLedgerResult {
  const tranches: PledgeLedgerTranche[] = [input.base, ...(input.topups ?? [])]
    .filter((tranche) => tranche.amount > 0 || tranche.rate > 0)
    .map((tranche) => ({
      amount: roundMoney(Math.max(0, tranche.amount)),
      rate: Math.max(0, tranche.rate),
      date: tranche.date,
      paidUpto: tranche.date,
    }))

  const originalPrincipal = roundMoney(
    tranches.reduce((sum, tranche) => sum + tranche.amount, 0),
  )

  let assessedInterest = 0
  let credit = 0
  let totalDiscount = 0
  let overpayment = 0
  const allocations: PledgePaymentAllocation[] = []

  const ordered = (input.payments ?? [])
    .map((payment, index) => ({ payment, index }))
    .sort((a, b) =>
      a.payment.date === b.payment.date
        ? a.index - b.index
        : a.payment.date < b.payment.date
          ? -1
          : 1,
    )
    .map((entry) => entry.payment)

  for (const payment of ordered) {
    const amount = Math.max(0, payment.amount)
    const discount = Math.max(0, payment.discount ?? 0)

    const accruals = tranches.map((tranche) => trancheAccrual(tranche, payment.date))
    const accrued = roundMoney(accruals.reduce((sum, item) => sum + item.interest, 0))
    const dueBeforeCredit = roundMoney(Math.max(0, accrued - credit))
    const discountToInterest = roundMoney(Math.min(discount, dueBeforeCredit))
    const remainingInterest = roundMoney(dueBeforeCredit - discountToInterest)
    const discountLeft = roundMoney(discount - discountToInterest)
    const cashToInterest = roundMoney(Math.min(amount, remainingInterest))
    const shortfall = roundMoney(remainingInterest - cashToInterest)

    let interestPart = 0
    let principalPart = 0
    let discountApplied = discountToInterest

    if (shortfall <= EPSILON) {
      for (let index = 0; index < tranches.length; index += 1) {
        const months = accruals[index].months
        if (months > 0) {
          tranches[index].paidUpto = addDaysIso(
            tranches[index].paidUpto,
            Math.round(months * PERIOD_DAYS),
          )
        }
      }
      assessedInterest = roundMoney(assessedInterest + accrued)
      credit = 0
      interestPart = cashToInterest

      const cashLeft = roundMoney(amount - cashToInterest)
      const applied = applyToPrincipal(tranches, cashLeft, discountLeft)
      principalPart = applied.cashApplied
      discountApplied = roundMoney(discountApplied + applied.discountApplied)
      overpayment = roundMoney(
        overpayment + (cashLeft - applied.cashApplied) + (discountLeft - applied.discountApplied),
      )
      totalDiscount = roundMoney(totalDiscount + discountApplied)
    } else {
      // Partial interest payment: hold it as credit and leave periods unpaid.
      credit = roundMoney(credit + cashToInterest + discountToInterest)
      interestPart = cashToInterest
      totalDiscount = roundMoney(totalDiscount + discountToInterest)
    }

    allocations.push({
      date: payment.date,
      amount,
      discount,
      interestPart,
      principalPart,
      discountApplied,
      coversInterest: shortfall <= EPSILON,
    })
  }

  let currentInterest = 0
  for (const tranche of tranches) {
    currentInterest = roundMoney(currentInterest + trancheAccrual(tranche, input.asOfDate).interest)
  }

  const principalOutstanding = roundMoney(
    tranches.reduce((sum, tranche) => sum + tranche.amount, 0),
  )
  const interestDue = roundMoney(Math.max(0, currentInterest - credit))
  const payoff = roundMoney(principalOutstanding + interestDue)
  const grossDue = roundMoney(originalPrincipal + assessedInterest + currentInterest - totalDiscount)

  const interestPaidUpto = tranches.length
    ? tranches.reduce(
        (earliest, tranche) => (tranche.paidUpto < earliest ? tranche.paidUpto : earliest),
        tranches[0].paidUpto,
      )
    : input.base.date

  const monthlyInterest = roundMoney(
    tranches.reduce((sum, tranche) => sum + tranche.amount * (tranche.rate / 100), 0),
  )

  return {
    originalPrincipal,
    principalOutstanding,
    assessedInterest,
    currentInterest,
    interestCredit: credit,
    interestDue,
    totalDiscount,
    grossDue,
    payoff,
    interestPaidUpto,
    nextInterestDue: addDaysIso(interestPaidUpto, PERIOD_DAYS),
    isInterestOverdue: daysBetween(interestPaidUpto, input.asOfDate) >= PERIOD_DAYS,
    monthlyInterest,
    overpayment,
    tranches,
    allocations,
  }
}
