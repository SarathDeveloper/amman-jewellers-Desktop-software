import { useState } from 'react'
import type { Invoice } from '@shared/types'
import { Modal } from '../../components/Modal'
import { formatCurrency } from '../../lib/format'
import { api } from '../../lib/api'

export function CancelBillModal({
  invoice,
  onClose,
  onCancelled,
}: {
  invoice: Invoice
  onClose: () => void
  onCancelled: (invoice: Invoice) => void
}) {
  const refund = Math.max(0, invoice.amountPaid)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('Enter a reason for cancelling this bill')
      return
    }
    try {
      setSaving(true)
      setError(null)
      const updated = await api.cancelInvoice(invoice.id, { reason: trimmed })
      onCancelled(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel bill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Cancel bill"
      onClose={onClose}
      busy={saving}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
            Keep bill
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Cancelling…' : 'Cancel bill'}
          </button>
        </div>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}
      <p className="bill-empty-hint">
        Cancel {invoice.invoiceNo}? Stock returns to inventory, HUIDs are restored, and any dues or
        linked old-gold purchases are released. The bill number stays used.
      </p>
      {refund > 0 ? (
        <p className="sale-bill-cancel-refund">Refund {formatCurrency(refund)} to the customer</p>
      ) : null}
      <div className="adagu-form-fields">
        <div className="adagu-field">
          <label>Reason</label>
          <input
            className="input"
            value={reason}
            disabled={saving}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this bill being cancelled?"
          />
        </div>
      </div>
    </Modal>
  )
}
