import type Database from 'better-sqlite3'
import { buildAdaguWhatsAppUrl } from '@shared/adagu/reminders'
import { addDaysIso } from '@shared/billing/pledgeMath'
import { localTodayIso } from '@shared/localDate'
import type { PledgeReminderEntry, PledgeReminderReason, PledgeStatus } from '@shared/types'
import { loadShopSettings } from '../lib/settingsStore'
import { replayForPledge, type PledgeLedgerCore } from './ledger'

/** Interest is flagged when it is due within this many days. */
const INTEREST_DUE_WINDOW_DAYS = 3
/** Loans maturing within this many days are flagged. */
const MATURITY_WINDOW_DAYS = 30

const REASON_PRIORITY: Record<PledgeReminderReason, number> = {
  auction_due: 0,
  auction_notice: 1,
  interest_overdue: 2,
  interest_due: 3,
  maturity: 4,
}

type ReminderPledgeRow = PledgeLedgerCore & {
  receipt_no: string
  repayment_due_date: string | null
  amount_collected: number
  customer_name: string
  customer_phone: string
  notice_date: string | null
  auction_date: string | null
  last_reminded_at: string | null
}

/** Signed day difference: negative when `to` is already in the past. */
function signedDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00`)
  const end = Date.parse(`${to}T12:00:00`)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.round((end - start) / (24 * 60 * 60 * 1000))
}

function statusOf(value: string): PledgeStatus {
  return value as PledgeStatus
}

export function buildPledgeReminders(
  db: Database.Database,
  asOf: string = localTodayIso(),
): PledgeReminderEntry[] {
  const settings = loadShopSettings(db)
  const rows = db
    .prepare(
      `SELECT p.id, p.customer_id, p.pledge_date, p.loan_amount, p.interest_pct,
              p.status, p.redeemed_date, p.receipt_no, p.repayment_due_date,
              p.amount_collected,
              c.name AS customer_name, c.phone AS customer_phone,
              (SELECT notice_date FROM pledge_auctions WHERE pledge_id = p.id) AS notice_date,
              (SELECT auction_date FROM pledge_auctions WHERE pledge_id = p.id) AS auction_date,
              (SELECT MAX(sent_at) FROM pledge_reminders WHERE pledge_id = p.id) AS last_reminded_at
       FROM pledges p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.status = 'active'
       ORDER BY p.pledge_date ASC, p.id ASC`,
    )
    .all() as ReminderPledgeRow[]

  const entries: PledgeReminderEntry[] = []

  for (const row of rows) {
    const { result } = replayForPledge(db, row, asOf)
    const nextInterestDue = result.nextInterestDue
    const interestDays = signedDaysBetween(asOf, nextInterestDue)
    const hasInterest = result.interestDue > 0.005 || nextInterestDue <= asOf

    const candidates: Array<{ reason: PledgeReminderReason; dueDate: string; daysUntil: number }> = []

    if (hasInterest) {
      if (interestDays < 0 || result.isInterestOverdue) {
        candidates.push({
          reason: 'interest_overdue',
          dueDate: nextInterestDue,
          daysUntil: interestDays,
        })
      } else if (interestDays <= INTEREST_DUE_WINDOW_DAYS) {
        candidates.push({ reason: 'interest_due', dueDate: nextInterestDue, daysUntil: interestDays })
      }
    }

    const dueDate = row.repayment_due_date
    if (dueDate) {
      const dueDays = signedDaysBetween(asOf, dueDate)
      if (!row.notice_date && dueDays < 0) {
        candidates.push({ reason: 'auction_notice', dueDate, daysUntil: dueDays })
      }
      if (row.notice_date && !row.auction_date) {
        const eligible = addDaysIso(row.notice_date, settings.adaguAuctionNoticeDays)
        const eligibleDays = signedDaysBetween(asOf, eligible)
        if (eligibleDays <= 0) {
          candidates.push({ reason: 'auction_due', dueDate: eligible, daysUntil: eligibleDays })
        }
      }
      if (dueDays >= 0 && dueDays <= MATURITY_WINDOW_DAYS) {
        candidates.push({ reason: 'maturity', dueDate, daysUntil: dueDays })
      }
    }

    if (candidates.length === 0) continue
    candidates.sort(
      (a, b) =>
        REASON_PRIORITY[a.reason] - REASON_PRIORITY[b.reason] ||
        a.daysUntil - b.daysUntil ||
        a.dueDate.localeCompare(b.dueDate),
    )
    const chosen = candidates[0]

    entries.push({
      pledgeId: row.id,
      receiptNo: row.receipt_no,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone ?? '',
      status: statusOf(row.status),
      reason: chosen.reason,
      dueDate: chosen.dueDate,
      daysUntil: chosen.daysUntil,
      interestDue: result.interestDue,
      principalOutstanding: result.principalOutstanding,
      totalDue: result.payoff,
      nextInterestDue,
      isInterestOverdue: result.isInterestOverdue,
      lastRemindedAt: row.last_reminded_at,
      whatsappUrl: buildAdaguWhatsAppUrl(row.customer_phone ?? '', settings.adaguReminderTemplate, {
        name: row.customer_name,
        receiptNo: row.receipt_no,
        interestDue: result.interestDue,
        dueDate: chosen.dueDate,
        principal: result.principalOutstanding,
        shopName: settings.shopName,
      }),
    })
  }

  entries.sort(
    (a, b) =>
      REASON_PRIORITY[a.reason] - REASON_PRIORITY[b.reason] ||
      a.daysUntil - b.daysUntil ||
      a.receiptNo.localeCompare(b.receiptNo),
  )
  return entries
}
