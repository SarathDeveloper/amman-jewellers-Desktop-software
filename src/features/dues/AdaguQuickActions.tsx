import { Link } from 'react-router-dom'
import { ExternalLink, FileText, Gavel, Handshake, Megaphone, Percent, Plus, RotateCcw } from 'lucide-react'
import type { AdaguDueSummary } from '@shared/types'

export function AdaguQuickActions({
  summary,
  disabled,
  stacked,
  onCollectInterest,
  onTopup,
  onRedeem,
  onRenew,
  onAuctionNotice,
  onRecordAuction,
  onPrintNotice,
  onViewBill,
  onReleaseReceipt,
}: {
  summary: AdaguDueSummary
  disabled?: boolean
  stacked?: boolean
  onCollectInterest: () => void
  onTopup: () => void
  onRedeem: () => void
  onRenew?: () => void
  onAuctionNotice: () => void
  onRecordAuction: () => void
  onPrintNotice?: () => void
  onViewBill?: () => void
  onReleaseReceipt?: () => void
}) {
  const active = summary.status === 'active'
  const hasBalance = summary.remaining > 0
  const redeemed = summary.status === 'redeemed'
  const panel = Boolean(stacked)

  return (
    <div className={panel ? 'adagu-detail-actions' : 'row-actions'}>
      <Link
        to={`/billing/adagu/${summary.pledgeId}`}
        className={panel ? 'btn adagu-detail-action-primary' : 'btn ghost'}
      >
        {panel ? <ExternalLink size={16} strokeWidth={1.75} aria-hidden /> : null}
        {panel ? 'Open Loan' : 'Open'}
      </Link>
      {!panel && onViewBill ? (
        <button type="button" className="btn ghost" onClick={onViewBill}>
          Bill
        </button>
      ) : null}
      {redeemed && onReleaseReceipt ? (
        <button
          type="button"
          className={panel ? 'btn secondary' : 'btn ghost'}
          onClick={onReleaseReceipt}
        >
          {panel ? <FileText size={16} strokeWidth={1.75} aria-hidden /> : null}
          {panel ? 'Release Receipt' : 'Release receipt'}
        </button>
      ) : null}
      {active && hasBalance ? (
        <>
          <button
            type="button"
            className={panel ? 'btn secondary' : 'btn ghost'}
            disabled={disabled}
            onClick={onCollectInterest}
          >
            {panel ? <Percent size={16} strokeWidth={1.75} aria-hidden /> : null}
            Interest
          </button>
          <button
            type="button"
            className={panel ? 'btn secondary' : 'btn ghost'}
            disabled={disabled}
            onClick={onTopup}
          >
            {panel ? <Plus size={16} strokeWidth={1.75} aria-hidden /> : null}
            Extra
          </button>
          <button
            type="button"
            className={panel ? 'btn adagu-detail-action-primary' : 'btn ghost collect-btn'}
            disabled={disabled}
            onClick={onRedeem}
          >
            {panel ? <Handshake size={16} strokeWidth={1.75} aria-hidden /> : null}
            Redeem
          </button>
          {onRenew ? (
            <button
              type="button"
              className={panel ? 'btn secondary' : 'btn ghost'}
              disabled={disabled}
              onClick={onRenew}
            >
              {panel ? <RotateCcw size={16} strokeWidth={1.75} aria-hidden /> : null}
              Renew
            </button>
          ) : null}
          <button
            type="button"
            className={panel ? 'btn secondary' : 'btn ghost'}
            disabled={disabled}
            onClick={onAuctionNotice}
          >
            {panel ? <Megaphone size={16} strokeWidth={1.75} aria-hidden /> : null}
            Notice
          </button>
          {summary.auctionNoticeDate && onPrintNotice ? (
            <button
              type="button"
              className={panel ? 'btn secondary' : 'btn ghost'}
              disabled={disabled}
              onClick={onPrintNotice}
            >
              {panel ? <FileText size={16} strokeWidth={1.75} aria-hidden /> : null}
              Print notice
            </button>
          ) : null}
          <button
            type="button"
            className={panel ? 'btn secondary' : 'btn ghost'}
            disabled={disabled}
            onClick={onRecordAuction}
          >
            {panel ? <Gavel size={16} strokeWidth={1.75} aria-hidden /> : null}
            Auction
          </button>
        </>
      ) : null}
    </div>
  )
}
