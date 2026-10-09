import { useState } from 'react'
import { Modal } from '../../components/Modal'

/** A small confirm-with-reason dialog, used for cancelling and for voids. */
export function OldGoldReasonModal({
  title,
  message,
  label,
  placeholder,
  confirmLabel,
  danger,
  busyLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  message: string
  label: string
  placeholder?: string
  confirmLabel: string
  danger?: boolean
  busyLabel?: string
  onCancel: () => void
  onConfirm: (reason: string) => Promise<void> | void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError(`Enter a ${label.toLowerCase()}`)
      return
    }
    try {
      setSaving(true)
      setError(null)
      await onConfirm(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={saving} onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className={danger ? 'btn danger' : 'btn'}
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? busyLabel ?? 'Saving…' : confirmLabel}
          </button>
        </div>
      }
    >
      {error ? <div className="error-banner">{error}</div> : null}
      <p className="bill-empty-hint">{message}</p>
      <div className="adagu-form-fields">
        <div className="adagu-field">
          <label>{label}</label>
          <input
            className="input"
            value={reason}
            disabled={saving}
            placeholder={placeholder}
            onChange={(event) => {
              setReason(event.target.value)
              setError(null)
            }}
          />
        </div>
      </div>
    </Modal>
  )
}
