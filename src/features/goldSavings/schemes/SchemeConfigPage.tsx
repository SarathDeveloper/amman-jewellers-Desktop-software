import { useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import type { GoldSavingScheme, GoldSavingSchemeInput } from '@shared/types'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { DataTable } from '../../../components/DataTable'
import { DateInput } from '../../../components/DateInput'
import { EmptyState } from '../../../components/EmptyState'
import { LoadingState } from '../../../components/LoadingState'
import { Modal } from '../../../components/Modal'
import { PageHeader } from '../../../components/PageHeader'
import { useToast } from '../../../components/toastContext'
import { formatCurrency } from '../../../lib/format'
import { api } from '../../../lib/api'
import { GsStatusBadge } from '../GsStatusBadge'

function emptyForm(): GoldSavingSchemeInput {
  return {
    name: '',
    description: '',
    monthlyAmount: 2000,
    durationMonths: 11,
    minInstallment: null,
    maxInstallment: null,
    purity: '22K',
    goldRateSource: 'configured',
    bonusType: 'none',
    bonusValue: 0,
    bonusEligibility: '',
    allowLatePayments: true,
    gracePeriodDays: 7,
    allowMissedInstallments: false,
    allowEarlyClosure: false,
    allowPartialRedemption: false,
    allowMultipleAccounts: false,
    redemptionType: 'jewellery',
    makingChargeRules: '',
    wastageRules: '',
    availableFrom: null,
    availableTo: null,
    terms: '',
    status: 'active',
  }
}

function formFromScheme(scheme: GoldSavingScheme | null): GoldSavingSchemeInput {
  if (!scheme) return emptyForm()
  return {
    name: scheme.name,
    description: scheme.description,
    monthlyAmount: scheme.monthlyAmount,
    durationMonths: scheme.durationMonths,
    minInstallment: scheme.minInstallment,
    maxInstallment: scheme.maxInstallment,
    purity: scheme.purity as GoldSavingSchemeInput['purity'],
    goldRateSource: scheme.goldRateSource,
    bonusType: scheme.bonusType,
    bonusValue: scheme.bonusValue,
    bonusEligibility: scheme.bonusEligibility,
    allowLatePayments: scheme.allowLatePayments,
    gracePeriodDays: scheme.gracePeriodDays,
    allowMissedInstallments: scheme.allowMissedInstallments,
    allowEarlyClosure: scheme.allowEarlyClosure,
    allowPartialRedemption: scheme.allowPartialRedemption,
    allowMultipleAccounts: scheme.allowMultipleAccounts,
    redemptionType: scheme.redemptionType,
    makingChargeRules: scheme.makingChargeRules,
    wastageRules: scheme.wastageRules,
    availableFrom: scheme.availableFrom,
    availableTo: scheme.availableTo,
    terms: scheme.terms,
    status: scheme.status,
  }
}

export function SchemeConfigPage() {
  const { showToast } = useToast()
  const [schemes, setSchemes] = useState<GoldSavingScheme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<GoldSavingScheme | null>(null)
  const [open, setOpen] = useState(false)
  const [toggle, setToggle] = useState<GoldSavingScheme | null>(null)

  async function reload() {
    const list = await api.listGsSchemes()
    setSchemes(list)
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        await reload()
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load schemes')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  async function toggleStatus() {
    if (!toggle) return
    try {
      await api.updateGsScheme(toggle.id, {
        name: toggle.name,
        description: toggle.description,
        monthlyAmount: toggle.monthlyAmount,
        durationMonths: toggle.durationMonths,
        minInstallment: toggle.minInstallment,
        maxInstallment: toggle.maxInstallment,
        purity: toggle.purity as GoldSavingSchemeInput['purity'],
        goldRateSource: toggle.goldRateSource,
        bonusType: toggle.bonusType,
        bonusValue: toggle.bonusValue,
        bonusEligibility: toggle.bonusEligibility,
        allowLatePayments: toggle.allowLatePayments,
        gracePeriodDays: toggle.gracePeriodDays,
        allowMissedInstallments: toggle.allowMissedInstallments,
        allowEarlyClosure: toggle.allowEarlyClosure,
        allowPartialRedemption: toggle.allowPartialRedemption,
        allowMultipleAccounts: toggle.allowMultipleAccounts,
        redemptionType: toggle.redemptionType,
        makingChargeRules: toggle.makingChargeRules,
        wastageRules: toggle.wastageRules,
        availableFrom: toggle.availableFrom,
        availableTo: toggle.availableTo,
        terms: toggle.terms,
        status: toggle.status === 'active' ? 'inactive' : 'active',
      })
      showToast(toggle.status === 'active' ? 'Scheme deactivated' : 'Scheme activated')
      await reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update scheme')
    } finally {
      setToggle(null)
    }
  }

  if (loading) {
    return (
      <div className="app-page app-page-fill">
        <LoadingState />
      </div>
    )
  }

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title="Scheme configuration"
        subtitle="Bonus, making charges and redemption rules are configured here — never hardcoded"
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            <Plus size={18} strokeWidth={2} aria-hidden />
            New scheme
          </button>
        }
      />
      {error ? <div className="error-banner">{error}</div> : null}
      {schemes.length === 0 ? (
        <EmptyState title="No schemes yet" description="Create a monthly gold savings scheme to start enrollments." />
      ) : (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Installment</th>
                <th>Duration</th>
                <th>Purity</th>
                <th>Bonus</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {schemes.map((scheme) => (
                <tr key={scheme.id}>
                  <td>{scheme.code}</td>
                  <td>{scheme.name}</td>
                  <td>{formatCurrency(scheme.monthlyAmount)}</td>
                  <td>{scheme.durationMonths} months</td>
                  <td>{scheme.purity}</td>
                  <td>{scheme.bonusType === 'none' ? 'None' : `${scheme.bonusType} (${scheme.bonusValue})`}</td>
                  <td>
                    <GsStatusBadge status={scheme.status} />
                  </td>
                  <td className="table-actions">
                    <div className="row-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setEditing(scheme)
                        setOpen(true)
                      }}
                    >
                      <Pencil size={16} />
                      Edit
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setToggle(scheme)}>
                      {scheme.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}
      {open ? (
        <SchemeFormModal
          key={editing?.id ?? 'new'}
          editing={editing}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false)
            await reload()
          }}
        />
      ) : null}
      {toggle ? (
        <ConfirmDialog
          title={toggle.status === 'active' ? 'Deactivate scheme' : 'Activate scheme'}
          message={`Change ${toggle.name} to ${toggle.status === 'active' ? 'inactive' : 'active'}? Existing accounts are not deleted.`}
          confirmLabel={toggle.status === 'active' ? 'Deactivate' : 'Activate'}
          danger={toggle.status === 'active'}
          onConfirm={() => void toggleStatus()}
          onCancel={() => setToggle(null)}
        />
      ) : null}
    </div>
  )
}

function SchemeFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: GoldSavingScheme | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState<GoldSavingSchemeInput>(() => formFromScheme(editing))
  const [saving, setSaving] = useState(false)

  async function save() {
    try {
      setSaving(true)
      if (editing) await api.updateGsScheme(editing.id, form)
      else await api.createGsScheme(form)
      showToast(editing ? 'Scheme updated' : 'Scheme created')
      await onSaved()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save scheme')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? `Edit ${editing.code}` : 'New scheme'}
      className="modal-wide"
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save scheme'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        <label>
          <span className="field-label">Scheme name</span>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          <span className="field-label">Duration (months)</span>
          <input
            className="input"
            type="number"
            min={1}
            value={form.durationMonths}
            onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })}
          />
        </label>
        <label className="full">
          <span className="field-label">Description</span>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label>
          <span className="field-label">Monthly installment</span>
          <input
            className="input"
            type="number"
            min={1}
            value={form.monthlyAmount}
            onChange={(e) => setForm({ ...form, monthlyAmount: Number(e.target.value) })}
          />
        </label>
        <label>
          <span className="field-label">Minimum installment</span>
          <input
            className="input"
            type="number"
            value={form.minInstallment ?? ''}
            onChange={(e) => setForm({ ...form, minInstallment: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label>
          <span className="field-label">Maximum installment</span>
          <input
            className="input"
            type="number"
            value={form.maxInstallment ?? ''}
            onChange={(e) => setForm({ ...form, maxInstallment: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label>
          <span className="field-label">Gold purity</span>
          <select className="input" value={form.purity} onChange={(e) => setForm({ ...form, purity: e.target.value as GoldSavingSchemeInput['purity'] })}>
            <option value="24K">24K</option>
            <option value="22K">22K</option>
            <option value="18K">18K</option>
          </select>
        </label>
        <label>
          <span className="field-label">Gold rate source</span>
          <select
            className="input"
            value={form.goldRateSource}
            onChange={(e) => setForm({ ...form, goldRateSource: e.target.value as GoldSavingSchemeInput['goldRateSource'] })}
          >
            <option value="configured">Existing rate configuration</option>
            <option value="manual_allowed">Allow manual entry (admin)</option>
          </select>
        </label>
        <label>
          <span className="field-label">Gold rate unit</span>
          <input className="input" value="₹ per gram" disabled />
        </label>
        <label>
          <span className="field-label">Bonus type</span>
          <select
            className="input"
            value={form.bonusType}
            onChange={(e) => setForm({ ...form, bonusType: e.target.value as GoldSavingSchemeInput['bonusType'] })}
          >
            <option value="none">None</option>
            <option value="fixed_amount">Fixed amount</option>
            <option value="percentage">Percentage</option>
            <option value="additional_gold">Additional gold weight</option>
          </select>
        </label>
        <label>
          <span className="field-label">Bonus value</span>
          <input
            className="input"
            type="number"
            min={0}
            value={form.bonusValue}
            onChange={(e) => setForm({ ...form, bonusValue: Number(e.target.value) })}
          />
        </label>
        <label className="full">
          <span className="field-label">Bonus eligibility rules</span>
          <textarea
            className="textarea"
            value={form.bonusEligibility}
            onChange={(e) => setForm({ ...form, bonusEligibility: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label">Redemption type</span>
          <select
            className="input"
            value={form.redemptionType}
            onChange={(e) => setForm({ ...form, redemptionType: e.target.value as GoldSavingSchemeInput['redemptionType'] })}
          >
            <option value="gold">Gold</option>
            <option value="jewellery">Jewellery purchase</option>
            <option value="configurable">Configurable</option>
          </select>
        </label>
        <label>
          <span className="field-label">Grace period (days)</span>
          <input
            className="input"
            type="number"
            min={0}
            value={form.gracePeriodDays}
            onChange={(e) => setForm({ ...form, gracePeriodDays: Number(e.target.value) })}
          />
        </label>
        <label className="full">
          <span className="field-label">Making charge rules</span>
          <textarea className="textarea" value={form.makingChargeRules} onChange={(e) => setForm({ ...form, makingChargeRules: e.target.value })} />
        </label>
        <label className="full">
          <span className="field-label">Wastage rules</span>
          <textarea className="textarea" value={form.wastageRules} onChange={(e) => setForm({ ...form, wastageRules: e.target.value })} />
        </label>
        <label>
          <span className="field-label">Available from</span>
          <DateInput className="input" value={form.availableFrom ?? ''} onChange={(value) => setForm({ ...form, availableFrom: value || null })} showIcon />
        </label>
        <label>
          <span className="field-label">Available to</span>
          <DateInput className="input" value={form.availableTo ?? ''} onChange={(value) => setForm({ ...form, availableTo: value || null })} showIcon />
        </label>
        <label className="full">
          <span className="field-label">Terms and conditions</span>
          <textarea className="textarea" rows={4} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
        </label>
        <label className="gs-check"><input type="checkbox" checked={form.allowLatePayments} onChange={(e) => setForm({ ...form, allowLatePayments: e.target.checked })} /> Allow late payments</label>
        <label className="gs-check"><input type="checkbox" checked={form.allowMissedInstallments} onChange={(e) => setForm({ ...form, allowMissedInstallments: e.target.checked })} /> Allow missed installments</label>
        <label className="gs-check"><input type="checkbox" checked={form.allowEarlyClosure} onChange={(e) => setForm({ ...form, allowEarlyClosure: e.target.checked })} /> Allow early closure</label>
        <label className="gs-check"><input type="checkbox" checked={form.allowPartialRedemption} onChange={(e) => setForm({ ...form, allowPartialRedemption: e.target.checked })} /> Allow partial redemption</label>
        <label className="gs-check"><input type="checkbox" checked={form.allowMultipleAccounts} onChange={(e) => setForm({ ...form, allowMultipleAccounts: e.target.checked })} /> Allow multiple accounts per customer</label>
      </div>
    </Modal>
  )
}
