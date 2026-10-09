import { useMemo, useState } from 'react'
import { monthlyPledgeInterestAmount, totalPrincipalWithTopups } from '@shared/billing/pledgeMath'
import { localTodayIso } from '@shared/localDate'
import type { AdaguDueSummary } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { formatCurrency } from '../../lib/format'

export function TopupModal({
  summary,
  busy,
  onClose,
  onSubmit,
}: {
  summary: AdaguDueSummary
  busy?: boolean
  onClose: () => void
  onSubmit: (input: { amount: number; topupDate: string; note: string }) => void
}) {
  const [amount, setAmount] = useState(0)
  const [topupDate, setTopupDate] = useState(localTodayIso())
  const [note, setNote] = useState('')

  const preview = useMemo(() => {
    const nextPrincipal = totalPrincipalWithTopups(summary.principal, [{ amount }])
    const monthlyInterest = monthlyPledgeInterestAmount(nextPrincipal, summary.interestPct)
    return { nextPrincipal, monthlyInterest }
  }, [amount, summary.interestPct, summary.principal])

  return (
    <Modal
      title={`Extra loan · ${summary.receiptNo}`}
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
            onClick={() => onSubmit({ amount, topupDate, note })}
          >
            {busy ? 'Adding…' : 'Add extra'}
          </button>
        </div>
      }
    >
      <p className="muted">
        Adds extra cash against the same pledged items. Interest on the extra starts from the
        top-up date.
      </p>
      <dl className="dues-detail-totals">
        <div>
          <dt>Current principal</dt>
          <dd className="num">{formatCurrency(summary.principal)}</dd>
        </div>
        <div>
          <dt>New principal</dt>
          <dd className="num">{formatCurrency(preview.nextPrincipal)}</dd>
        </div>
        <div>
          <dt>Monthly interest</dt>
          <dd className="num">{formatCurrency(preview.monthlyInterest)}</dd>
        </div>
      </dl>
      <div className="form-grid">
        <label>
          Date
          <DateInput className="input" value={topupDate} onChange={(value) => setTopupDate(value || localTodayIso())} />
        </label>
        <label>
          Extra amount
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={amount || ''}
            onChange={(event) => setAmount(Number(event.target.value) || 0)}
          />
        </label>
        <label className="full">
          Note
          <input
            className="input"
            placeholder="Optional"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  )
}
