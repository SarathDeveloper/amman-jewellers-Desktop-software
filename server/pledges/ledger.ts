import type Database from 'better-sqlite3'
import {
  replayPledge,
  type PledgeLedgerPaymentInput,
  type PledgeLedgerResult,
  type PledgeLedgerTrancheInput,
} from '@shared/billing/pledgeLedger'
import { localTodayIso } from '@shared/localDate'
import type { PledgePayment, PledgePaymentKind, PledgePaymentMode } from '@shared/types'

export type PledgeLedgerCore = {
  id: number
  customer_id: number
  pledge_date: string
  loan_amount: number
  interest_pct: number
  status: string
  redeemed_date: string | null
}

export type PledgePaymentDbRow = {
  id: number
  pledge_id: number
  payment_date: string
  kind: string
  mode: string
  amount: number
  interest_part: number
  principal_part: number
  discount: number
  note: string
  created_at: string
}

export function mapPledgePayment(row: PledgePaymentDbRow): PledgePayment {
  return {
    id: row.id,
    pledgeId: row.pledge_id,
    paymentDate: row.payment_date,
    kind: row.kind as PledgePaymentKind,
    mode: row.mode as PledgePaymentMode,
    amount: row.amount,
    interestPart: row.interest_part,
    principalPart: row.principal_part,
    discount: row.discount,
    note: row.note ?? '',
    createdAt: row.created_at,
  }
}

/** As-of date used for reporting a pledge: today while active, else the close date. */
export function pledgeAsOfDate(pledge: {
  status: string
  redeemed_date: string | null
}): string {
  if (pledge.status === 'active') return localTodayIso()
  return pledge.redeemed_date || localTodayIso()
}

export function loadPledgeCore(
  db: Database.Database,
  pledgeId: number,
): PledgeLedgerCore | undefined {
  return db
    .prepare(
      `SELECT id, customer_id, pledge_date, loan_amount, interest_pct, status, redeemed_date
       FROM pledges WHERE id = ?`,
    )
    .get(pledgeId) as PledgeLedgerCore | undefined
}

export function loadPledgePayments(
  db: Database.Database,
  pledgeId: number,
): PledgePayment[] {
  const rows = db
    .prepare(
      `SELECT id, pledge_id, payment_date, kind, mode, amount, interest_part,
              principal_part, discount, note, created_at
       FROM pledge_payments
       WHERE pledge_id = ?
       ORDER BY payment_date ASC, id ASC`,
    )
    .all(pledgeId) as PledgePaymentDbRow[]
  return rows.map(mapPledgePayment)
}

export type PledgeTrancheSource = Pick<
  PledgeLedgerCore,
  'id' | 'loan_amount' | 'interest_pct' | 'pledge_date'
>

export function loadPledgeTranches(
  db: Database.Database,
  pledge: PledgeTrancheSource,
): { base: PledgeLedgerTrancheInput; topups: PledgeLedgerTrancheInput[] } {
  const rows = db
    .prepare(
      `SELECT topup_date, amount, interest_pct
       FROM pledge_topups WHERE pledge_id = ?
       ORDER BY topup_date ASC, id ASC`,
    )
    .all(pledge.id) as Array<{ topup_date: string; amount: number; interest_pct: number }>
  return {
    base: {
      amount: pledge.loan_amount,
      rate: pledge.interest_pct,
      date: pledge.pledge_date,
    },
    topups: rows.map((row) => ({
      amount: row.amount,
      rate: row.interest_pct,
      date: row.topup_date,
    })),
  }
}

export function toLedgerPayments(rows: PledgePayment[]): PledgeLedgerPaymentInput[] {
  return rows.map((row) => ({
    date: row.paymentDate,
    amount: row.amount,
    discount: row.discount,
  }))
}

export function replayForPledge(
  db: Database.Database,
  pledge: PledgeLedgerCore,
  asOfDate: string,
): { result: PledgeLedgerResult; payments: PledgePayment[] } {
  const { base, topups } = loadPledgeTranches(db, pledge)
  const payments = loadPledgePayments(db, pledge.id)
  const result = replayPledge({
    base,
    topups,
    payments: toLedgerPayments(payments),
    asOfDate,
  })
  return { result, payments }
}

/** Replay a pledge at its own as-of date (today while active, close date otherwise). */
export function computePledgeLedger(
  db: Database.Database,
  pledgeId: number,
): PledgeLedgerResult | null {
  const pledge = loadPledgeCore(db, pledgeId)
  if (!pledge) return null
  return replayForPledge(db, pledge, pledgeAsOfDate(pledge)).result
}
