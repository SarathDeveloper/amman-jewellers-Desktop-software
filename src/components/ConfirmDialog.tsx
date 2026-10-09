import { useEffect, useRef } from 'react'
import { Modal } from './Modal'

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  /** While true both buttons are disabled and the dialog cannot be dismissed. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Focus the primary action so the dialog is keyboard-usable immediately.
    confirmRef.current?.focus()
  }, [])

  return (
    <Modal
      title={title}
      busy={busy}
      onClose={onCancel}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn${danger ? ' danger' : ''}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="confirm-dialog-copy">{message}</p>
    </Modal>
  )
}
