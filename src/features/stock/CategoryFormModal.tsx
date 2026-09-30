import { CircleHelp, Save } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { parseNumericField, type NumericField } from '../../lib/numericField'

export type CategoryForm = {
  name: string
  openingWeight: NumericField
  salesOverride: NumericField
  overrideReason: string
}

type CategoryFormModalProps = {
  mode: 'add' | 'edit'
  form: CategoryForm
  setForm: (updater: (current: CategoryForm) => CategoryForm) => void
  preview: { inward: number; sales: number; closing: number }
  dayClosed: boolean
  saving: boolean
  onClose: () => void
  onSave: () => void
}

export function CategoryFormModal({
  mode,
  form,
  setForm,
  preview,
  dayClosed,
  saving,
  onClose,
  onSave,
}: CategoryFormModalProps) {
  return (
    <Modal
      title={mode === 'add' ? 'Add Category' : 'Category Details'}
      onClose={onClose}
      className="stock-category-modal"
      footer={
        dayClosed ? (
          <p className="muted">Day is closed — values are locked from the snapshot.</p>
        ) : (
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={saving} onClick={onSave}>
              <Save size={16} aria-hidden />
              {mode === 'add' ? 'Add Category' : 'Update Category'}
            </button>
          </div>
        )
      }
    >
      <div className="form-grid">
        <label className="span-2">
          Category Name
          <input
            className="input"
            value={form.name}
            disabled={dayClosed}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </label>

        <label>
          Opening Weight (g)
          <input
            className="input num stock-field-opening"
            type="number"
            step="0.001"
            min={0}
            disabled={dayClosed}
            value={form.openingWeight}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                openingWeight: parseNumericField(event.target.value),
              }))
            }
          />
        </label>

        <label>
          Inward Weight (g)
          <input className="input num stock-field-inward" type="number" readOnly value={preview.inward} />
        </label>

        <label>
          <span className="stock-field-label">
            Sales Weight (g)
            <CircleHelp size={13} aria-hidden />
          </span>
          <input className="input num stock-field-sales" type="number" readOnly value={preview.sales} />
        </label>

        <label>
          Closing Weight (g)
          <input className="input num stock-field-closing" type="number" readOnly value={preview.closing} />
        </label>

        <label className="span-2">
          <span className="stock-field-label">
            Sales Override (g)
            <span className="stock-optional">Optional</span>
          </span>
          <input
            className="input num"
            type="number"
            step="0.001"
            min={0}
            disabled={dayClosed}
            value={form.salesOverride}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                salesOverride: parseNumericField(event.target.value),
              }))
            }
          />
        </label>

        {form.salesOverride !== '' ? (
          <label className="span-2">
            Override reason
            <input
              className="input"
              disabled={dayClosed}
              value={form.overrideReason}
              placeholder="Why is auto sales being replaced?"
              onChange={(event) => setForm((current) => ({ ...current, overrideReason: event.target.value }))}
            />
          </label>
        ) : null}
      </div>
    </Modal>
  )
}
