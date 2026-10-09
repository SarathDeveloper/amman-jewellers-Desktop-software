import type Database from 'better-sqlite3'
import { addDaysIso } from '@shared/billing/pledgeMath'
import type { PledgeAuction, PledgeAuctionBuyerType, PledgePaymentMode } from '@shared/types'
import { loadShopSettings } from '../lib/settingsStore'

type AuctionRow = {
  id: number
  pledge_id: number
  notice_date: string
  auction_date: string | null
  buyer_type: string | null
  buyer_name: string
  sale_amount: number
  payoff_at_auction: number
  surplus_amount: number
  surplus_paid_date: string | null
  surplus_mode: string | null
  shortfall_amount: number
  shortfall_written_off: number
  note: string
}

export function mapAuctionRow(
  row: AuctionRow,
  noticeDays: number,
): PledgeAuction {
  return {
    id: row.id,
    pledgeId: row.pledge_id,
    noticeDate: row.notice_date,
    auctionDate: row.auction_date,
    buyerType: (row.buyer_type as PledgeAuctionBuyerType | null) ?? null,
    buyerName: row.buyer_name ?? '',
    saleAmount: row.sale_amount,
    payoffAtAuction: row.payoff_at_auction,
    surplusAmount: row.surplus_amount,
    surplusPaidDate: row.surplus_paid_date,
    surplusMode: (row.surplus_mode as PledgePaymentMode | null) ?? null,
    shortfallAmount: row.shortfall_amount,
    shortfallWrittenOff: row.shortfall_written_off === 1,
    note: row.note ?? '',
    noticeDays,
    auctionEligibleDate: addDaysIso(row.notice_date, noticeDays),
  }
}

export function loadPledgeAuction(
  db: Database.Database,
  pledgeId: number,
  noticeDays?: number,
): PledgeAuction | null {
  const row = db
    .prepare('SELECT * FROM pledge_auctions WHERE pledge_id = ?')
    .get(pledgeId) as AuctionRow | undefined
  if (!row) return null
  const days = noticeDays ?? loadShopSettings(db).adaguAuctionNoticeDays
  return mapAuctionRow(row, days)
}
