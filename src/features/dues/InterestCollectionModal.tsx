import { useMemo, useState } from 'react'
import { nextInterestDueDate } from '@shared/billing/pledgeMath'
import { localTodayIso } from '@shared/localDate'
import type { AdaguDueSummary } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { formatCurrency, formatDisplayDate } from '../../lib/format'

export function InterestCollectionModal({
  summary,
  busy,
  onClose,
  onSubmit,
}: {
  summary: AdaguDueSummary
  busy?: boolean
  onClose: () => void
  onSubmit: (input: { amount: number; collectedDate: string }) => void
}) {
  const suggested = Math.min(summary.monthlyInterest, summary.remaining) || summary.remaining
  const [amount, setAmount] = useState(suggested)
  const [collectedDate, setCollectedDate] = useState(localTodayIso())

  const nextDue = useMemo(
    () => nextInterestDueDate(summary.pledgeDate, collectedDate || localTodayIso()),
    [summary.pledgeDate, collectedDate],
  )

  return (
    <Modal
      title={`Collect interest · ${summary.receiptNo}`}
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || amount <= 0}
            onClick={() => onSubmit({ amount, collectedDate })}
          >
            Record collection
          </button>
        </div>
      }
    >
      <p className="muted">
        Principal {formatCurrency(summary.principal)} · monthly interest{' '}
        {formatCurrency(summary.monthlyInterest)} · remaining{' '}
        <strong>{formatCurrency(summary.remaining)}</strong>.
      </p>
      {summary.isInterestOverdue ? (
        <p className="dues-overdue-copy">Interest period is overdue. Collect before closing the loan.</p>
      ) : null}
      <dl className="dues-detail-totals">
        <div>
          <dt>Total due</dt>
          <dd className="num">{formatCurrency(summary.totalDue)}</dd>
        </div>
        <div>
          <dt>Collected</dt>
          <dd className="num">{formatCurrency(summary.amountCollected)}</dd>
        </div>
        <div>
          <dt>Next interest due</dt>
          <dd>{formatDisplayDate(nextDue)}</dd>
        </div>
      </dl>
      <div className="form-grid">
        <label>
          Date
          <DateInput
            className="input"
            value={collectedDate}
            onChange={(value) => setCollectedDate(value || localTodayIso())}
          />
        </label>
        <label>
          Amount
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            max={summary.remaining}
            value={amount || ''}
            onChange={(event) => setAmount(Number(event.target.value) || 0)}
          />
        </label>
      </div>
      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: '0.5rem' }}
        onClick={() => setAmount(Math.min(summary.monthlyInterest, summary.remaining))}
      >
        Fill monthly interest
      </button>
    </Modal>
  )
}
