import { useState } from 'react'
import { resolveAmountPayable } from '@shared/billing/billSummary'
import { localTodayIso } from '@shared/localDate'
import type { Invoice, PaymentMode } from '@shared/types'
import { Modal } from '../../components/Modal'
import { DateInput } from '../../components/DateInput'
import { formatCurrency } from '../../lib/format'
import { api } from '../../lib/api'
import { parseNumericField } from '../../lib/numericField'
import { PaymentModeSelect, SINGLE_PAYMENT_MODES } from './PaymentModeSelect'

export function RecordPaymentModal({
  invoice,
  onClose,
  onRecorded,
}: {
  invoice: Invoice
  onClose: () => void
  onRecorded: (invoice: Invoice) => void
}) {
  const remaining = Math.max(0, resolveAmountPayable(invoice.amountPayable, invoice.total) - invoice.amountPaid)
  const [amount, setAmount] = useState<number | ''>(remaining || '')
  const [mode, setMode] = useState<Extract<PaymentMode, 'cash' | 'upi' | 'card'>>('cash')
  const [entryDate, setEntryDate] = useState(localTodayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    const paid = amount === '' ? 0 : amount
    if (paid <= 0) {
      setError('Enter a payment amount')
      return
    }
    if (paid - remaining > 0.009) {
      setError('Payment cannot exceed the balance due')
      return
    }
    try {
      setSaving(true)
      setError(null)
      const updated = await api.recordInvoicePayment(invoice.id, {
        amount: paid,
        entryDate,
        note,
        mode,
      })
      onRecorded(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Record payment"
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={saving || remaining <= 0} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'Save payment'}
          </button>
        </div>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}
      <p className="bill-empty-hint">
        Balance due {formatCurrency(remaining)} on {invoice.invoiceNo}
      </p>
      <div className="adagu-form-fields two-col">
        <div className="adagu-field">
          <label>Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(parseNumericField(event.target.value))}
          />
        </div>
        <div className="adagu-field">
          <label>Date</label>
          <DateInput className="input" value={entryDate} onChange={setEntryDate} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <PaymentModeSelect
            value={mode}
            modes={SINGLE_PAYMENT_MODES}
            disabled={saving}
            onChange={setMode}
          />
        </div>
        <div className="adagu-field" style={{ gridColumn: '1 / -1' }}>
          <label>Note</label>
          <input className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
        </div>
      </div>
    </Modal>
  )
}
