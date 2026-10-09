import type Database from 'better-sqlite3'
import { replayPledge } from '@shared/billing/pledgeLedger'
import { roundMoney } from '@shared/billing/pricing'
import type {
  PledgePayment,
  PledgePaymentKind,
  PledgePaymentMode,
  PledgePayoff,
} from '@shared/types'
import { daysBetween } from '@shared/billing/pledgeMath'
import { HttpError } from '../lib/http'
import { syncDueEntryForPledge } from '../dues/pledgeSync'
import {
  loadPledgeCore,
  loadPledgePayments,
  loadPledgeTranches,
  mapPledgePayment,
  pledgeAsOfDate,
  replayForPledge,
  toLedgerPayments,
  type PledgeLedgerCore,
  type PledgePaymentDbRow,
} from './ledger'

const EPSILON = 0.01

export type RecordPledgePaymentInput = {
  pledgeId: number
  date: string
  amount: number
  discount?: number
  mode: PledgePaymentMode
  kind: PledgePaymentKind
  note?: string
  /** Close the loan automatically once the principal reaches zero. */
  closeWhenSettled?: boolean
}

export function requireActivePledge(
  db: Database.Database,
  pledgeId: number,
): PledgeLedgerCore {
  const pledge = loadPledgeCore(db, pledgeId)
  if (!pledge) throw new HttpError(404, 'Pledge not found')
  if (pledge.status !== 'active') {
    throw new HttpError(400, 'Only active Adagu pledges can receive payments')
  }
  return pledge
}

function mapPayoff(
  pledge: PledgeLedgerCore,
  asOfDate: string,
  result: ReturnType<typeof replayPledge>,
): PledgePayoff {
  return {
    asOfDate,
    principalOutstanding: result.principalOutstanding,
    assessedInterest: result.assessedInterest,
    currentInterest: result.currentInterest,
    interestCredit: result.interestCredit,
    interestDue: result.interestDue,
    totalDiscount: result.totalDiscount,
    grossDue: result.grossDue,
    payoff: result.payoff,
    daysActive: daysBetween(pledge.pledge_date, asOfDate),
    interestPaidUpto: result.interestPaidUpto,
    nextInterestDue: result.nextInterestDue,
    isInterestOverdue: result.isInterestOverdue,
    monthlyInterest: result.monthlyInterest,
  }
}

/** Replay a pledge at a date (defaults to its own as-of date). */
export function computePledgePayoff(
  db: Database.Database,
  pledgeId: number,
  asOfDate?: string,
): PledgePayoff | null {
  const pledge = loadPledgeCore(db, pledgeId)
  if (!pledge) return null
  const date = asOfDate || pledgeAsOfDate(pledge)
  const { result } = replayForPledge(db, pledge, date)
  return mapPayoff(pledge, date, result)
}

function syncPledgeCollected(db: Database.Database, pledgeId: number): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM pledge_payments WHERE pledge_id = ?')
    .get(pledgeId) as { n: number }
  const collected = roundMoney(row.n)
  db.prepare('UPDATE pledges SET amount_collected = ? WHERE id = ?').run(collected, pledgeId)
  return collected
}

/**
 * The one place a pledge payment is written. Splits the money into interest and
 * principal, records the money-ledger row, updates the collection cache, and
 * closes the loan when the principal is cleared.
 */
export function recordPledgePayment(
  db: Database.Database,
  input: RecordPledgePaymentInput,
): PledgePayment {
  const pledge = requireActivePledge(db, input.pledgeId)

  if (input.date < pledge.pledge_date) {
    throw new HttpError(400, 'Payment date cannot be before the pledge date')
  }

  const { base, topups } = loadPledgeTranches(db, pledge)
  const existing = loadPledgePayments(db, pledge.id)
  const lastPayment = existing[existing.length - 1]
  if (lastPayment && input.date < lastPayment.paymentDate) {
    throw new HttpError(400, 'Payment date cannot be before the last payment')
  }

  const amount = roundMoney(Math.max(0, input.amount))
  const discount = roundMoney(Math.max(0, input.discount ?? 0))

  const before = replayPledge({
    base,
    topups,
    payments: toLedgerPayments(existing),
    asOfDate: input.date,
  })
  if (amount + discount > before.payoff + EPSILON) {
    throw new HttpError(
      400,
      `Payment exceeds the payoff of ${before.payoff.toFixed(2)}`,
    )
  }

  const after = replayPledge({
    base,
    topups,
    payments: [...toLedgerPayments(existing), { date: input.date, amount, discount }],
    asOfDate: input.date,
  })
  const allocation = after.allocations[after.allocations.length - 1]
  const note = input.note ?? ''

  const info = db
    .prepare(
      `INSERT INTO pledge_payments (
         pledge_id, payment_date, kind, mode, amount, interest_part, principal_part, discount, note
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      pledge.id,
      input.date,
      input.kind,
      input.mode,
      amount,
      allocation.interestPart,
      allocation.principalPart,
      discount,
      note,
    )
  const paymentId = Number(info.lastInsertRowid)

  db.prepare(
    `INSERT INTO customer_dues (
       customer_id, entry_date, kind, amount, note, pledge_id, pledge_payment_id, created_at
     ) VALUES (?, ?, 'payment', ?, ?, ?, ?, datetime('now'))`,
  ).run(pledge.customer_id, input.date, amount, note, pledge.id, paymentId)

  const collected = syncPledgeCollected(db, pledge.id)

  const closeWhenSettled = input.closeWhenSettled ?? true
  if (closeWhenSettled && after.principalOutstanding <= EPSILON && after.overpayment <= EPSILON) {
    db.prepare(
      `UPDATE pledges SET status = 'redeemed', redeemed_date = ?, amount_collected = ? WHERE id = ?`,
    ).run(input.date, collected, pledge.id)
  }

  syncDueEntryForPledge(db, pledge.id)
  return mapPaymentById(db, paymentId)
}

export function mapPaymentById(db: Database.Database, paymentId: number): PledgePayment {
  const row = db
    .prepare(
      `SELECT id, pledge_id, payment_date, kind, mode, amount, interest_part,
              principal_part, discount, note, created_at
       FROM pledge_payments WHERE id = ?`,
    )
    .get(paymentId) as PledgePaymentDbRow | undefined
  if (!row) throw new HttpError(404, 'Payment not found')
  return mapPledgePayment(row)
}

/**
 * Remove the most recent payment and rebuild the pledge state. Only the latest
 * payment can be removed, so earlier interest periods stay consistent.
 */
export function deleteLatestPledgePayment(
  db: Database.Database,
  pledgePaymentId: number,
): number {
  const row = db
    .prepare('SELECT id, pledge_id, payment_date FROM pledge_payments WHERE id = ?')
    .get(pledgePaymentId) as
    | { id: number; pledge_id: number; payment_date: string }
    | undefined
  if (!row) throw new HttpError(404, 'Payment not found')

  const latest = db
    .prepare(
      `SELECT id FROM pledge_payments WHERE pledge_id = ?
       ORDER BY payment_date DESC, id DESC LIMIT 1`,
    )
    .get(row.pledge_id) as { id: number } | undefined
  if (!latest || latest.id !== row.id) {
    throw new HttpError(400, 'Only the latest payment can be removed')
  }

  db.prepare('DELETE FROM customer_dues WHERE pledge_payment_id = ?').run(row.id)
  db.prepare('DELETE FROM pledge_payments WHERE id = ?').run(row.id)

  const collected = syncPledgeCollected(db, row.pledge_id)
  const ledger = computePledgePayoff(db, row.pledge_id)
  if (ledger && ledger.principalOutstanding > EPSILON) {
    db.prepare(
      `UPDATE pledges SET status = 'active', redeemed_date = NULL, amount_collected = ?
       WHERE id = ? AND status = 'redeemed'`,
    ).run(collected, row.pledge_id)
  }

  syncDueEntryForPledge(db, row.pledge_id)
  return row.pledge_id
}
