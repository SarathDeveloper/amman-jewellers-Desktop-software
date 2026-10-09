import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { localTodayIso } from '@shared/localDate'
import type { OldGoldPayoutMode, OldGoldPurchase } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { formatCurrency } from '../../lib/format'

/** Cash above this in a day needs care (Income Tax section 40A(3)). */
const CASH_WARNING_LIMIT = 10_000

export function OldGoldPayoutModal({
  purchase,
  onClose,
  onSaved,
}: {
  purchase: OldGoldPurchase
  onClose: () => void
  onSaved: (purchase: OldGoldPurchase) => Promise<void> | void
}) {
  const [payoutDate, setPayoutDate] = useState(localTodayIso())
  const [amount, setAmount] = useState(purchase.balance > 0 ? String(purchase.balance) : '')
  const [mode, setMode] = useState<OldGoldPayoutMode>('cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const numericAmount = Number.parseFloat(amount)
  const cashWarning = mode === 'cash' && Number.isFinite(numericAmount) && numericAmount >= CASH_WARNING_LIMIT

  async function submit() {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter an amount to pay out')
      return
    }
    if (numericAmount - purchase.balance > 0.009) {
      setError(`Only ${formatCurrency(purchase.balance)} is left on this purchase`)
      return
    }
    try {
      setSaving(true)
      setError(null)
      const updated = await api.createOldGoldPayout(purchase.id, {
        payoutDate,
        amount: numericAmount,
        mode,
        note: note.trim(),
      })
      await onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Pay out ${purchase.purchaseNo}`}
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'Record payout'}
          </button>
        </div>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}
      <p className="bill-empty-hint">
        {purchase.customerName || 'Customer'} sold this old gold. Balance available{' '}
        {formatCurrency(purchase.balance)} of {formatCurrency(purchase.totalAmount)}.
      </p>
      {cashWarning ? (
        <p className="old-gold-link-error old-gold-cash-warning">
          <AlertTriangle size={14} aria-hidden /> A cash payout of {formatCurrency(numericAmount)} may
          need the customer's PAN, and cash above Rs 10,000 a day is restricted under section 40A(3).
        </p>
      ) : null}
      <div className="adagu-form-fields">
        <div className="adagu-field">
          <label>Date</label>
          <DateInput className="input" value={payoutDate} disabled={saving} onChange={setPayoutDate} />
        </div>
        <div className="adagu-field">
          <label>Mode</label>
          <select
            className="input"
            value={mode}
            disabled={saving}
            onChange={(event) => setMode(event.target.value as OldGoldPayoutMode)}
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank / cheque</option>
          </select>
        </div>
        <div className="adagu-field">
          <label>Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={amount}
            disabled={saving}
            onChange={(event) => {
              setAmount(event.target.value)
              setError(null)
            }}
          />
        </div>
        <div className="adagu-field">
          <label>Note</label>
          <input
            className="input"
            value={note}
            disabled={saving}
            placeholder="Optional"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
