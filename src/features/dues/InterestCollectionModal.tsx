import { useMemo, useState } from 'react'
import { localTodayIso } from '@shared/localDate'
import type { AdaguDueSummary, PledgePaymentMode } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { PLEDGE_PAYMENT_MODES } from './pledgePaymentModes'

export function InterestCollectionModal({
  summary,
  busy,
  onClose,
  onSubmit,
}: {
  summary: AdaguDueSummary
  busy?: boolean
  onClose: () => void
  onSubmit: (input: { amount: number; collectedDate: string; mode: PledgePaymentMode }) => void
}) {
  const suggested = Math.min(summary.monthlyInterest, summary.remaining) || summary.remaining
  const [amount, setAmount] = useState(suggested)
  const [collectedDate, setCollectedDate] = useState(localTodayIso())
  const [mode, setMode] = useState<PledgePaymentMode>('cash')

  const interestDue = useMemo(
    () => Math.max(summary.interestDue, 0),
    [summary.interestDue],
  )

  return (
    <Modal
      title={`Collect interest · ${summary.receiptNo}`}
      onClose={onClose}
      busy={busy}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || amount <= 0}
            onClick={() => onSubmit({ amount, collectedDate, mode })}
          >
            {busy ? 'Recording…' : 'Record collection'}
          </button>
        </div>
      }
    >
      <p className="muted">
        Principal {formatCurrency(summary.principalOutstanding)} · monthly interest{' '}
        {formatCurrency(summary.monthlyInterest)} · remaining{' '}
        <strong>{formatCurrency(summary.remaining)}</strong>.
      </p>
      {summary.isInterestOverdue ? (
        <p className="dues-overdue-copy">Interest period is overdue. Collect before closing the loan.</p>
      ) : null}
      <dl className="dues-detail-totals">
        <div>
          <dt>Interest due</dt>
          <dd className="num">{formatCurrency(interestDue)}</dd>
        </div>
        <div>
          <dt>Next interest due</dt>
          <dd>{formatDisplayDate(summary.nextInterestDue)}</dd>
        </div>
        <div>
          <dt>Interest paid up to</dt>
          <dd>{formatDisplayDate(summary.interestPaidUpto)}</dd>
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
            autoFocus
            onChange={(event) => setAmount(Number(event.target.value) || 0)}
          />
        </label>
        <label>
          Mode
          <select
            className="input"
            value={mode}
            onChange={(event) => setMode(event.target.value as PledgePaymentMode)}
          >
            {PLEDGE_PAYMENT_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-inline-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => setAmount(interestDue > 0 ? interestDue : Math.min(summary.monthlyInterest, summary.remaining))}
        >
          Fill interest due
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setAmount(Math.min(summary.monthlyInterest, summary.remaining))}
        >
          Fill monthly interest
        </button>
      </div>
    </Modal>
  )
}
