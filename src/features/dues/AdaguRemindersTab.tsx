import { Link } from 'react-router-dom'
import { ExternalLink, MessageCircle, Percent } from 'lucide-react'
import type { PledgeReminderEntry, PledgeReminderReason } from '@shared/types'
import { DataTable } from '../../components/DataTable'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../lib/format'

function reasonInfo(reason: PledgeReminderReason): {
  label: string
  tone: 'urgent' | 'warn'
} {
  switch (reason) {
    case 'interest_overdue':
      return { label: 'Interest overdue', tone: 'urgent' }
    case 'interest_due':
      return { label: 'Interest due soon', tone: 'warn' }
    case 'auction_notice':
      return { label: 'Send auction notice', tone: 'urgent' }
    case 'auction_due':
      return { label: 'Ready to auction', tone: 'urgent' }
    default:
      return { label: 'Matures soon', tone: 'warn' }
  }
}

export function AdaguRemindersTab({
  rows,
  loading,
  busy,
  onWhatsApp,
  onCollectInterest,
}: {
  rows: PledgeReminderEntry[]
  loading: boolean
  busy?: boolean
  onWhatsApp: (row: PledgeReminderEntry) => void
  onCollectInterest: (row: PledgeReminderEntry) => void
}) {
  if (loading) {
    return <LoadingState />
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No reminders"
        description="Interest due, maturing loans and auction-ready tickets will appear here."
      />
    )
  }

  return (
    <>
      <p className="adagu-reminders-hint">
        Reminders open WhatsApp with a ready-made message and record that the borrower was reminded.
      </p>
      <DataTable>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Customer</th>
              <th>Receipt No</th>
              <th>Reason</th>
              <th>Due</th>
              <th className="num">Interest Due</th>
              <th>Last Reminded</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const info = reasonInfo(row.reason)
              return (
                <tr key={`${row.pledgeId}-${row.reason}`}>
                  <td>{String(index + 1).padStart(2, '0')}</td>
                  <td>
                    <div className="cell-truncate" title={row.customerName}>
                      {row.customerName}
                    </div>
                    <span className="muted">{row.customerPhone || '—'}</span>
                  </td>
                  <td className="dues-adagu-receipt">
                    <Link to={`/billing/adagu/${row.pledgeId}`}>{row.receiptNo}</Link>
                  </td>
                  <td>
                    <span className={`adagu-reminder-badge adagu-reminder-badge--${info.tone}`}>
                      {info.label}
                    </span>
                  </td>
                  <td className={row.daysUntil < 0 ? 'adagu-reminder-overdue' : ''}>
                    {row.dueDate ? formatDisplayDate(row.dueDate) : '—'}
                    {row.daysUntil < 0 ? ` (${Math.abs(row.daysUntil)}d late)` : ''}
                  </td>
                  <td className="num">{formatCurrency(row.interestDue)}</td>
                  <td>{row.lastRemindedAt ? formatDisplayDateTime(row.lastRemindedAt) : '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy || !row.whatsappUrl}
                        title={row.whatsappUrl ? 'Open WhatsApp' : 'Add a mobile number to remind'}
                        onClick={() => onWhatsApp(row)}
                      >
                        <MessageCircle size={14} strokeWidth={1.75} aria-hidden />
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy || row.interestDue <= 0}
                        onClick={() => onCollectInterest(row)}
                      >
                        <Percent size={14} strokeWidth={1.75} aria-hidden />
                        Interest
                      </button>
                      <Link className="btn ghost" to={`/billing/adagu/${row.pledgeId}`}>
                        <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </DataTable>
    </>
  )
}
