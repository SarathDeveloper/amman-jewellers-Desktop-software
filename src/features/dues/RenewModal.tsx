import { useState } from 'react'
import { localTodayIso } from '@shared/localDate'
import type { PledgePaymentMode } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { PLEDGE_PAYMENT_MODES } from './pledgePaymentModes'

export type RenewModalSummary = {
  receiptNo: string
  interestDue: number
  principalOutstanding: number
  interestPaidUpto: string
  remaining: number
}

export function RenewModal({
  summary,
  busy,
  onClose,
  onSubmit,
}: {
  summary: RenewModalSummary
  busy?: boolean
  onClose: () => void
  onSubmit: (input: {
    renewDate: string
    mode: PledgePaymentMode
    newLoanAmount: number
    note: string
  }) => void
}) {
  const [renewDate, setRenewDate] = useState(localTodayIso())
  const [newLoanAmount, setNewLoanAmount] = useState(summary.principalOutstanding)
  const [mode, setMode] = useState<PledgePaymentMode>('cash')
  const [note, setNote] = useState('')

  const difference = newLoanAmount - summary.principalOutstanding

  return (
    <Modal
      title={`Renew loan · ${summary.receiptNo}`}
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
            disabled={busy || newLoanAmount < 0}
            onClick={() => onSubmit({ renewDate, mode, newLoanAmount, note })}
          >
            {busy ? 'Renewing…' : 'Renew loan'}
          </button>
        </div>
      }
    >
      <p className="muted">
        The interest due is collected now and the balance moves to a new Adagu ticket. A new ADG
        receipt is generated.
      </p>
      <dl className="dues-detail-totals">
        <div>
          <dt>Interest due</dt>
          <dd className="num">{formatCurrency(summary.interestDue)}</dd>
        </div>
        <div>
          <dt>Outstanding principal</dt>
          <dd className="num">{formatCurrency(summary.principalOutstanding)}</dd>
        </div>
        <div>
          <dt>Interest paid up to</dt>
          <dd>{formatDisplayDate(summary.interestPaidUpto)}</dd>
        </div>
        <div>
          <dt>Total payoff</dt>
          <dd className="num">{formatCurrency(summary.remaining)}</dd>
        </div>
      </dl>
      <div className="form-grid">
        <label>
          Renewal date
          <DateInput
            className="input"
            value={renewDate}
            onChange={(value) => setRenewDate(value || localTodayIso())}
          />
        </label>
        <label>
          New loan amount
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={newLoanAmount || ''}
            onChange={(event) => setNewLoanAmount(Number(event.target.value) || 0)}
          />
        </label>
        <label>
          Interest mode
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
        <label>
          Note
          <input
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note"
          />
        </label>
      </div>
      <p className="muted">
        {Math.abs(difference) < 0.01
          ? 'The new ticket carries the same principal.'
          : difference > 0
            ? `Extra ${formatCurrency(difference)} will be paid out on the new ticket.`
            : `${formatCurrency(-difference)} will be collected now as principal.`}
      </p>
      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: '0.5rem' }}
        onClick={() => setNewLoanAmount(summary.principalOutstanding)}
      >
        Use outstanding principal
      </button>
    </Modal>
  )
}
