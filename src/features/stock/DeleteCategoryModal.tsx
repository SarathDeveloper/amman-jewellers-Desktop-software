import { useState } from 'react'
import { Modal } from '../../components/Modal'

export function DeleteCategoryModal({
  categoryName,
  onCancel,
  onConfirm,
}: {
  categoryName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [typedName, setTypedName] = useState('')
  const nameMatches = typedName === categoryName

  return (
    <Modal
      title={step === 1 ? 'Delete category?' : 'Confirm deletion'}
      onClose={onCancel}
      className="stock-delete-modal"
      footer={
        step === 1 ? (
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn" onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        ) : (
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="btn secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={!nameMatches}
              onClick={onConfirm}
            >
              Delete permanently
            </button>
          </div>
        )
      }
    >
      {step === 1 ? (
        <div className="stock-delete-copy">
          <p>
            You are about to delete <strong>{categoryName}</strong>.
          </p>
          <ul>
            <li>This category will be removed from Gold and Silver stock.</li>
            <li>Its daily opening, sales, and closing rows will be deleted.</li>
            <li>
              Products and past bills keep their category text, but they will no longer match this
              stock row.
            </li>
          </ul>
        </div>
      ) : (
        <div className="stock-delete-copy">
          <p>
            Type <strong>{categoryName}</strong> to confirm permanent deletion.
          </p>
          <label>
            Category name
            <input
              className="input"
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              autoComplete="off"
              aria-label="Type category name to confirm"
            />
          </label>
        </div>
      )}
    </Modal>
  )
}
