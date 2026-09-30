import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Gem,
  IdCard,
  MapPin,
  MoreVertical,
  Phone,
  Printer,
  User,
  Zap,
} from 'lucide-react'
import type { AdaguDueSummary, DueEntry, Pledge, PledgeStatus } from '@shared/types'
import { Drawer } from '../../components/Drawer'
import { LoadingState } from '../../components/LoadingState'
import {
  formatCurrency,
  formatDisplayDate,
  formatDisplayDateTime,
  formatWeight,
} from '../../lib/format'
import { api } from '../../lib/api'
import { AdaguQuickActions } from './AdaguQuickActions'

function statusLabel(status: PledgeStatus) {
  if (status === 'redeemed') return 'Redeemed'
  if (status === 'forfeited') return 'Forfeited'
  if (status === 'draft') return 'Draft'
  return 'Active'
}

function statusHint(status: PledgeStatus, remaining: number) {
  if (status === 'redeemed' || remaining <= 0) return 'Loan has been settled'
  if (status === 'forfeited') return 'Pledge closed without gold release'
  return remaining > 0 ? 'Loan is outstanding' : 'No remaining due'
}

function historyTime(iso: string | null | undefined) {
  const formatted = formatDisplayDateTime(iso)
  if (formatted === '—') return ''
  const parts = formatted.trim().split(' ')
  return parts.length >= 2 ? `${parts[parts.length - 2]} ${parts[parts.length - 1]}` : ''
}

type HistoryRow = {
  id: string
  date: string
  time: string
  title: string
  note: string
}

export function AdaguDueDetailDrawer({
  summary,
  payments = [],
  busy,
  onClose,
  onCollectInterest,
  onTopup,
  onRedeem,
  onForfeit,
  onViewBill,
  onReleaseReceipt,
}: {
  summary: AdaguDueSummary
  payments?: DueEntry[]
  busy?: boolean
  onClose: () => void
  onCollectInterest: () => void
  onTopup: () => void
  onRedeem: () => void
  onForfeit: () => void
  onViewBill: () => void
  onReleaseReceipt: () => void
}) {
  const [pledge, setPledge] = useState<Pledge | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await api.getPledge(summary.pledgeId)
        if (active) setPledge(data)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load Adagu details')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [summary.pledgeId])

  useEffect(() => {
    if (!moreOpen) return
    function onPointerDown(event: PointerEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [moreOpen])

  const topups = pledge?.topups ?? summary.topups ?? []
  const items = pledge?.items ?? []
  const settled = summary.status === 'redeemed' || summary.remaining <= 0
  const activeLoan = summary.status === 'active' && summary.remaining > 0
  const statusTone =
    summary.status === 'redeemed' || settled
      ? 'success'
      : summary.status === 'forfeited'
        ? 'danger'
        : summary.isInterestOverdue
          ? 'danger'
          : 'active'

  const history = useMemo<HistoryRow[]>(() => {
    const rows: HistoryRow[] = payments.map((payment) => ({
      id: `pay-${payment.id}`,
      date: payment.entryDate,
      time: historyTime(payment.createdAt),
      title: `Paid ${formatCurrency(payment.amount)}`,
      note:
        payment.note ||
        (summary.status === 'redeemed' && payment.amount >= summary.principal
          ? 'Loan settled (Full payment)'
          : 'Payment received'),
    }))
    for (const topup of topups) {
      rows.push({
        id: `topup-${topup.id}`,
        date: topup.topupDate,
        time: historyTime(topup.createdAt),
        title: `Extra ${formatCurrency(topup.amount)}`,
        note: topup.note || 'Extra loan',
      })
    }
    if (rows.length === 0 && summary.amountCollected > 0) {
      rows.push({
        id: 'collected',
        date: pledge?.redeemedDate || summary.pledgeDate,
        time: historyTime(pledge?.createdAt),
        title: `Paid ${formatCurrency(summary.amountCollected)}`,
        note: summary.status === 'redeemed' ? 'Loan settled (Full payment)' : 'Amount collected',
      })
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  }, [payments, topups, summary.amountCollected, summary.pledgeDate, summary.principal, summary.status, pledge])

  function downloadReceipt() {
    onViewBill()
  }

  return (
    <Drawer title={summary.customerName} onClose={onClose} size="page" hideTitle>
      {loading && !pledge ? (
        <LoadingState />
      ) : (
        <div className="adagu-detail">
          <header className="adagu-detail-toolbar">
            <button type="button" className="btn ghost adagu-detail-back" onClick={onClose}>
              <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
              Back to Due List
            </button>
            <div className="adagu-detail-toolbar-actions">
              <button type="button" className="btn secondary" onClick={onViewBill}>
                <Printer size={16} strokeWidth={1.75} aria-hidden />
                Print Receipt
              </button>
              <button type="button" className="btn secondary" onClick={downloadReceipt}>
                <Download size={16} strokeWidth={1.75} aria-hidden />
                Download Receipt
              </button>
              <div className="adagu-detail-more" ref={moreRef}>
                <button
                  type="button"
                  className="btn secondary adagu-detail-more-btn"
                  aria-label="More"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((open) => !open)}
                >
                  <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
                  More
                </button>
                {moreOpen ? (
                  <div className="adagu-detail-more-menu" role="menu">
                    {activeLoan ? (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          className="adagu-detail-more-item"
                          disabled={busy}
                          onClick={() => {
                            setMoreOpen(false)
                            onCollectInterest()
                          }}
                        >
                          Collect interest
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="adagu-detail-more-item"
                          disabled={busy}
                          onClick={() => {
                            setMoreOpen(false)
                            onTopup()
                          }}
                        >
                          Extra loan
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="adagu-detail-more-item"
                          disabled={busy}
                          onClick={() => {
                            setMoreOpen(false)
                            onForfeit()
                          }}
                        >
                          Close / Forfeit
                        </button>
                      </>
                    ) : null}
                    {summary.status === 'redeemed' ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="adagu-detail-more-item"
                        onClick={() => {
                          setMoreOpen(false)
                          onReleaseReceipt()
                        }}
                      >
                        Release receipt
                      </button>
                    ) : null}
                    <a
                      role="menuitem"
                      className="adagu-detail-more-item"
                      href={`/billing/adagu/${summary.pledgeId}`}
                      onClick={() => setMoreOpen(false)}
                    >
                      Open loan editor
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          {error ? <p className="muted">{error}</p> : null}

          <section className="adagu-detail-customer">
            <div className="adagu-detail-customer-main">
              <div className="adagu-detail-avatar" aria-hidden>
                <User size={22} strokeWidth={1.75} />
              </div>
              <div className="adagu-detail-customer-copy">
                <h2>{summary.customerName}</h2>
                {pledge?.guardianName ? (
                  <p className="muted">Guardian: {pledge.guardianName}</p>
                ) : null}
                <div className="adagu-detail-customer-meta">
                  <span>
                    <IdCard size={14} strokeWidth={1.75} aria-hidden />
                    <span>
                      <small>Customer ID</small>
                      <strong>{summary.customerId}</strong>
                    </span>
                  </span>
                  <span>
                    <Phone size={14} strokeWidth={1.75} aria-hidden />
                    <span>
                      <small>Contact</small>
                      <strong>{summary.customerPhone || '—'}</strong>
                    </span>
                  </span>
                  <span>
                    <MapPin size={14} strokeWidth={1.75} aria-hidden />
                    <span>
                      <small>Address</small>
                      <strong>{pledge?.customerAddress || '—'}</strong>
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className={`adagu-detail-status adagu-detail-status--${statusTone}`}>
              <strong>
                <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
                {statusLabel(summary.status)}
              </strong>
              <span>{statusHint(summary.status, summary.remaining)}</span>
            </div>
          </section>

          <section className="adagu-detail-card">
            <div className="adagu-detail-card-head">
              <FileText size={16} strokeWidth={1.75} aria-hidden />
              <h3>Loan Summary</h3>
            </div>
            <dl className="adagu-detail-stats adagu-detail-stats--loan">
              <div>
                <dt>Loan ID</dt>
                <dd>{summary.receiptNo}</dd>
              </div>
              <div>
                <dt>Loan Date</dt>
                <dd>{formatDisplayDate(summary.pledgeDate)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`adagu-detail-pill adagu-detail-pill--${statusTone}`}>
                    <CheckCircle2 size={12} strokeWidth={2} aria-hidden />
                    {statusLabel(summary.status)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Principal</dt>
                <dd>{formatCurrency(summary.principal)}</dd>
              </div>
              <div>
                <dt>Interest</dt>
                <dd>{summary.interestPct}%</dd>
              </div>
            </dl>
          </section>

          <section className="adagu-detail-card">
            <div className="adagu-detail-card-head">
              <Gem size={16} strokeWidth={1.75} aria-hidden />
              <h3>Gold Pledged</h3>
            </div>
            {items.length === 0 ? (
              <p className="muted">No pledged items on this loan.</p>
            ) : (
              <table className="adagu-detail-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Item</th>
                    <th>Metal</th>
                    <th>Net Wt</th>
                    <th>Pcs</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>
                        {item.description || '—'}
                        {item.identification ? <span className="cell-hint">{item.identification}</span> : null}
                      </td>
                      <td>
                        {item.metal}
                        {item.purity ? ` ${item.purity}` : ''}
                      </td>
                      <td className="num">{formatWeight(item.netWeight)}</td>
                      <td className="num">{item.pieces}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="adagu-detail-split">
            <section className="adagu-detail-card">
              <div className="adagu-detail-card-head">
                <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
                <h3>Due Summary</h3>
              </div>
              {summary.isInterestOverdue ? (
                <p className="dues-overdue-copy">Interest period is overdue.</p>
              ) : null}
              <dl className="adagu-detail-stats adagu-detail-stats--due">
                <div>
                  <dt>Monthly interest</dt>
                  <dd>{formatCurrency(summary.monthlyInterest)}</dd>
                </div>
                <div>
                  <dt>Next due</dt>
                  <dd>{formatDisplayDate(summary.nextInterestDue)}</dd>
                </div>
                <div>
                  <dt>Days active</dt>
                  <dd>{summary.daysActive}</dd>
                </div>
                <div>
                  <dt>Total due</dt>
                  <dd>{formatCurrency(summary.totalDue)}</dd>
                </div>
                <div>
                  <dt>Collected</dt>
                  <dd>{formatCurrency(summary.amountCollected)}</dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd className={summary.remaining > 0 ? 'due-amount' : 'paid-amount'}>
                    {formatCurrency(summary.remaining)}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              className={`adagu-detail-card adagu-detail-settle${settled ? ' adagu-detail-settle--paid' : ''}`}
            >
              <div className="adagu-detail-card-head">
                <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden />
                <h3>Payment / Settlement</h3>
              </div>
              <div className="adagu-detail-settle-body">
                <div className={`adagu-detail-settle-banner adagu-detail-settle-banner--${statusTone}`}>
                  <CheckCircle2 size={28} strokeWidth={1.75} aria-hidden />
                  <div>
                    <strong>
                      {summary.status === 'forfeited'
                        ? 'Forfeited / Closed'
                        : settled
                          ? 'Fully Paid / Settled'
                          : 'Outstanding'}
                    </strong>
                    <p>
                      {summary.status === 'forfeited'
                        ? 'This pledge was closed without gold release.'
                        : settled
                          ? 'This loan has been completely paid.'
                          : 'Collect interest or redeem to settle this loan.'}
                    </p>
                  </div>
                </div>
                <dl className="adagu-detail-settle-totals">
                  <div>
                    <dt>Total Paid</dt>
                    <dd>{formatCurrency(summary.amountCollected)}</dd>
                  </div>
                  <div>
                    <dt>Balance Due</dt>
                    <dd className={summary.remaining > 0 ? 'due-amount' : 'paid-amount'}>
                      {formatCurrency(summary.remaining)}
                    </dd>
                  </div>
                </dl>
                {activeLoan ? (
                  <button type="button" className="btn" disabled={busy} onClick={onRedeem}>
                    Collect / Redeem
                  </button>
                ) : null}
              </div>
            </section>
          </div>

          <div className="adagu-detail-split">
            <section className="adagu-detail-card">
              <div className="adagu-detail-card-head">
                <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden />
                <h3>Payment History</h3>
              </div>
              {history.length === 0 ? (
                <p className="muted">No collections recorded yet.</p>
              ) : (
                <ul className="adagu-detail-history">
                  {history.map((row) => (
                    <li key={row.id}>
                      <span className="adagu-detail-history-dot" aria-hidden />
                      <div className="adagu-detail-history-copy">
                        <span className="adagu-detail-history-date">{formatDisplayDate(row.date)}</span>
                        <strong>{row.title}</strong>
                        {row.note ? <span className="muted">{row.note}</span> : null}
                      </div>
                      {row.time ? <time className="adagu-detail-history-time">{row.time}</time> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="adagu-detail-card">
              <div className="adagu-detail-card-head">
                <Zap size={16} strokeWidth={1.75} aria-hidden />
                <h3>Actions</h3>
              </div>
              <AdaguQuickActions
                summary={summary}
                disabled={busy}
                stacked
                onCollectInterest={onCollectInterest}
                onTopup={onTopup}
                onRedeem={onRedeem}
                onClose={onForfeit}
                onViewBill={onViewBill}
                onReleaseReceipt={onReleaseReceipt}
              />
            </section>
          </div>
        </div>
      )}
    </Drawer>
  )
}
