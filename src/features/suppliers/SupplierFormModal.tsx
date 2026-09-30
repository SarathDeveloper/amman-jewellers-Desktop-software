import { useEffect, useState } from 'react'
import type { Supplier, SupplierInput } from '@shared/types'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'

export const emptySupplierInput: SupplierInput = {
  name: '',
  phone: '',
  address: '',
  notes: '',
  gstin: '',
}

type SupplierFormModalProps = {
  open: boolean
  editing?: Supplier | null
  onClose: () => void
  onSaved: (supplier: Supplier) => void
  onError?: (message: string) => void
}

export function SupplierFormModal({
  open,
  editing = null,
  onClose,
  onSaved,
  onError,
}: SupplierFormModalProps) {
  const [form, setForm] = useState<SupplierInput>(emptySupplierInput)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name,
        phone: editing.phone,
        address: editing.address,
        notes: editing.notes,
        gstin: editing.gstin ?? '',
      })
    } else {
      setForm(emptySupplierInput)
    }
  }, [open, editing])

  async function save() {
    try {
      setSaving(true)
      const supplier = editing
        ? await api.updateSupplier(editing.id, form)
        : await api.createSupplier(form)
      onSaved(supplier)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save supplier'
      onError?.(message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      title={editing ? 'Edit supplier' : 'Add supplier'}
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => void save()} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        <label>
          Name
          <input
            className="input"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label>
          Phone
          <input
            className="input"
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          />
        </label>
        <label>
          GSTIN
          <input
            className="input"
            value={form.gstin ?? ''}
            maxLength={20}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                gstin: event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20),
              }))
            }
          />
        </label>
        <label className="span-2">
          Address
          <textarea
            className="input"
            rows={2}
            value={form.address}
            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
          />
        </label>
        <label className="span-2">
          Notes
          <textarea
            className="input"
            rows={2}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </label>
      </div>
    </Modal>
  )
}
