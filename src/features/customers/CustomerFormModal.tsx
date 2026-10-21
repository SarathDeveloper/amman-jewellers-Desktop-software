import { useEffect, useState } from 'react'
import type { Customer, CustomerInput } from '@shared/types'
import { formatPanInput, isCompletePan, PAN_FORMAT_MESSAGE } from '@shared/schemas'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import {
  customerFieldErrors,
  takeCustomerFormError,
  type CustomerField,
  type CustomerFieldErrors,
} from './customerFieldErrors'

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
}

export function CustomerFormModal({
  open,
  editing = null,
  initialValues,
  onClose,
  onSaved,
}: CustomerFormModalProps) {
  const [form, setForm] = useState<CustomerInput>(emptyCustomerInput)
  const [fieldErrors, setFieldErrors] = useState<CustomerFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setFieldErrors({})
    setFormError(null)
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

  function updateField<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      if (!current[key as CustomerField]) return current
      const next = { ...current }
      delete next[key as CustomerField]
      return next
    })
  }

  async function save() {
    const payload: CustomerInput = {
      name: form.name.trim(),
      phone: form.phone.replace(/\D/g, ''),
      address: form.address.trim(),
      guardianName: (form.guardianName ?? '').trim(),
      notes: (form.notes ?? '').trim(),
      gstin: (form.gstin ?? '').trim(),
      aadhaar: digitsOnly(form.aadhaar ?? '', 12),
      pan: formatPanInput(form.pan ?? ''),
      idProofType: editing?.idProofType ?? '',
    }

    const errors = customerFieldErrors(payload)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setFormError(null)
      return
    }

    try {
      setSaving(true)
      setFormError(null)
      const customer = editing
        ? await api.updateCustomer(editing.id, payload)
        : await api.createCustomer(payload)
      onSaved(customer)
      onClose()
    } catch (err) {
      const fields = takeCustomerFormError(err)
      if (fields) {
        setFieldErrors(fields)
        setFormError(null)
      } else {
        setFormError(err instanceof Error ? err.message : 'Failed to save customer')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      className="customer-form-modal"
      title={editing ? 'Edit customer' : 'Add customer'}
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            form="customer-form"
            className="btn"
            disabled={saving || !isCompletePan(form.pan ?? '')}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <form
        id="customer-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        {formError ? <div className="error-banner" role="alert">{formError}</div> : null}
        <div className="form-grid">
          <label>
            <span className="field-label">
              Name <span className="req" aria-hidden="true">*</span>
            </span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              autoComplete="name"
              aria-label="Name"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <span className="adagu-field-error" role="alert">{fieldErrors.name}</span>
            ) : null}
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
              onChange={(e) => updateField('phone', digitsOnly(e.target.value, 10))}
              autoComplete="tel"
              aria-label="Mobile"
              aria-invalid={Boolean(fieldErrors.phone)}
            />
            {fieldErrors.phone ? (
              <span className="adagu-field-error" role="alert">{fieldErrors.phone}</span>
            ) : null}
          </label>
          <label>
            <span className="field-label">F / M / H Name</span>
            <input
              className="input"
              value={form.guardianName ?? ''}
              onChange={(e) => updateField('guardianName', e.target.value)}
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
              onChange={(e) => updateField('aadhaar', digitsOnly(e.target.value, 12))}
              placeholder="Optional"
              aria-label="Aadhaar"
              aria-invalid={Boolean(fieldErrors.aadhaar)}
            />
            {fieldErrors.aadhaar ? (
              <span className="adagu-field-error" role="alert">{fieldErrors.aadhaar}</span>
            ) : null}
          </label>
          <label>
            <span className="field-label">PAN</span>
            <input
              className="input"
              maxLength={10}
              value={form.pan ?? ''}
              onChange={(e) => updateField('pan', formatPanInput(e.target.value))}
              placeholder="AAAAA9999A"
              aria-label="PAN"
              aria-invalid={(form.pan ?? '').trim() !== '' && !isCompletePan(form.pan ?? '')}
            />
            {(form.pan ?? '').trim() !== '' && !isCompletePan(form.pan ?? '') ? (
              <span className="adagu-field-error" role="alert">
                {PAN_FORMAT_MESSAGE}
              </span>
            ) : null}
          </label>
          <label className="full">
            <span className="field-label">
              Address <span className="req" aria-hidden="true">*</span>
            </span>
            <textarea
              className="textarea"
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              rows={2}
              aria-label="Address"
              aria-invalid={Boolean(fieldErrors.address)}
            />
            {fieldErrors.address ? (
              <span className="adagu-field-error" role="alert">{fieldErrors.address}</span>
            ) : null}
          </label>
          <label className="full">
            <span className="field-label">Notes</span>
            <textarea
              className="textarea"
              value={form.notes ?? ''}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={2}
              placeholder="Optional"
              aria-label="Notes"
            />
          </label>
        </div>
      </form>
    </Modal>
  )
}
