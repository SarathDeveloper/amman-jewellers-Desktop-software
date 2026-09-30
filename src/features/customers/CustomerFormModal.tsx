import { useEffect, useState } from 'react'
import type { Customer, CustomerInput } from '@shared/types'
import { customerInputSchema } from '@shared/schemas'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'

export const emptyCustomerInput: CustomerInput = {
  name: '',
  phone: '',
  address: '',
  guardianName: '',
  notes: '',
  gstin: '',
  aadhaar: '',
  pan: '',
}

export function looksLikePhone(query: string): boolean {
  const digits = query.replace(/\D/g, '')
  return digits.length >= 6 && /^[\d\s+\-()]+$/.test(query.trim())
}

export function prefillFromSearch(query: string): CustomerInput {
  const trimmed = query.trim()
  if (!trimmed) return emptyCustomerInput
  if (looksLikePhone(trimmed)) {
    const digits = trimmed.replace(/\D/g, '').slice(0, 10)
    return { ...emptyCustomerInput, phone: digits }
  }
  return { ...emptyCustomerInput, name: trimmed }
}

function digitsOnly(value: string, maxLen: number): string {
  return value.replace(/\D/g, '').slice(0, maxLen)
}

type CustomerFormModalProps = {
  open: boolean
  editing?: Customer | null
  initialValues?: CustomerInput
  onClose: () => void
  onSaved: (customer: Customer) => void
  onError?: (message: string) => void
}

export function CustomerFormModal({
  open,
  editing = null,
  initialValues,
  onClose,
  onSaved,
  onError,
}: CustomerFormModalProps) {
  const [form, setForm] = useState<CustomerInput>(emptyCustomerInput)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name,
        phone: editing.phone,
        address: editing.address,
        guardianName: editing.guardianName ?? '',
        notes: editing.notes ?? '',
        gstin: editing.gstin ?? '',
        aadhaar: editing.aadhaar ?? '',
        pan: editing.pan ?? '',
      })
    } else {
      setForm(initialValues ?? emptyCustomerInput)
    }
  }, [open, editing, initialValues])

  async function save() {
    const payload: CustomerInput = {
      name: form.name.trim(),
      phone: form.phone.replace(/\D/g, ''),
      address: form.address.trim(),
      guardianName: (form.guardianName ?? '').trim(),
      notes: (form.notes ?? '').trim(),
      gstin: (form.gstin ?? '').trim(),
      aadhaar: digitsOnly(form.aadhaar ?? '', 12),
      pan: (form.pan ?? '').trim().toUpperCase(),
    }

    const parsed = customerInputSchema.safeParse(payload)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid customer details'
      onError?.(message)
      return
    }

    try {
      setSaving(true)
      const customer = editing
        ? await api.updateCustomer(editing.id, parsed.data)
        : await api.createCustomer(parsed.data)
      onSaved(customer)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save customer'
      onError?.(message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      title={editing ? 'Edit customer' : 'Add customer'}
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        <label>
          <span className="field-label">
            Name <span className="req" aria-hidden="true">*</span>
          </span>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoComplete="name"
            aria-label="Name"
          />
        </label>
        <label>
          <span className="field-label">
            Mobile <span className="req" aria-hidden="true">*</span>
          </span>
          <input
            className="input"
            inputMode="numeric"
            maxLength={10}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: digitsOnly(e.target.value, 10) })}
            autoComplete="tel"
            aria-label="Mobile"
          />
        </label>
        <label>
          <span className="field-label">F / M / H Name</span>
          <input
            className="input"
            value={form.guardianName ?? ''}
            onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
            placeholder="Father / Mother / Husband"
            aria-label="F / M / H Name"
          />
        </label>
        <label>
          <span className="field-label">Aadhaar</span>
          <input
            className="input"
            inputMode="numeric"
            maxLength={12}
            value={form.aadhaar ?? ''}
            onChange={(e) => setForm({ ...form, aadhaar: digitsOnly(e.target.value, 12) })}
            placeholder="Optional"
            aria-label="Aadhaar"
          />
        </label>
        <label>
          <span className="field-label">PAN</span>
          <input
            className="input"
            maxLength={10}
            value={form.pan ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                pan: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10),
              })
            }
            placeholder="Optional"
            aria-label="PAN"
          />
        </label>
        <label className="full">
          <span className="field-label">
            Address <span className="req" aria-hidden="true">*</span>
          </span>
          <textarea
            className="textarea"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            rows={2}
            aria-label="Address"
          />
        </label>
        <label className="full">
          <span className="field-label">Notes</span>
          <textarea
            className="textarea"
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Optional"
            aria-label="Notes"
          />
        </label>
      </div>
    </Modal>
  )
}
