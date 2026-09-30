import { Modal } from './Modal'

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`btn${danger ? ' danger' : ''}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="confirm-dialog-copy">{message}</p>
    </Modal>
  )
}
