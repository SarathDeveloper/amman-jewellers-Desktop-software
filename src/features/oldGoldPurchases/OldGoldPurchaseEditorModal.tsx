import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Calendar, Coins, Phone, StickyNote, User, X } from 'lucide-react'
import { computeOldGoldValue } from '@shared/billing/billSummary'
import { localTodayIso } from '@shared/localDate'
import type { Customer, MetalRates, OldGoldPurchase } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import { BillCustomerSearch } from '../invoices/BillCustomerSearch'
import {
  newOldGoldRow,
  toOldGoldInputs,
  type OldGoldEditorRow,
} from '../invoices/invoiceEditorHelpers'
import { OldGoldEditor } from '../invoices/oldGoldEditor'

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="product-form-field">
      {htmlFor ? (
        <>
          <label htmlFor={htmlFor}>
            <span className="product-form-label-text">{label}</span>
          </label>
          {children}
        </>
      ) : (
        <label>
          <span className="product-form-label-text">{label}</span>
          {children}
        </label>
      )}
    </div>
  )
}

function Control({
  icon,
  children,
}: {
  icon?: ReactNode
  children: ReactNode
}) {
  const classes = ['product-form-control', icon ? 'has-icon' : ''].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      {icon ? (
        <span className="product-form-lead-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </div>
  )
}

export function OldGoldPurchaseEditorModal({
  purchase,
  readOnly,
  onClose,
  onSaved,
}: {
  purchase: OldGoldPurchase | null
  readOnly: boolean
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const { showToast } = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [metalRates, setMetalRates] = useState<MetalRates | null>(null)
  const [previewNo, setPreviewNo] = useState('')
  const [customerId, setCustomerId] = useState(purchase?.customerId ?? 0)
  const [customerName, setCustomerName] = useState(purchase?.customerName ?? '')
  const [customerPhone, setCustomerPhone] = useState(purchase?.customerPhone ?? '')
  const [purchaseDate, setPurchaseDate] = useState(purchase?.purchaseDate ?? localTodayIso())
  const [notes, setNotes] = useState(purchase?.notes ?? '')
  const [rows, setRows] = useState<OldGoldEditorRow[]>(() =>
    purchase && purchase.items.length > 0
      ? purchase.items.map((item) => ({
          key: String(item.id),
          description: item.description,
          grossWeight: item.grossWeight || '',
          stoneWeight: item.stoneWeight || '',
          netWeight: item.netWeight || '',
          purity: item.purity || '22K',
          ratePerGram: item.ratePerGram || '',
          deductionPct: item.deductionPct || '',
        }))
      : [newOldGoldRow(null)],
  )
  const [purchaseId, setPurchaseId] = useState<number | null>(purchase?.id ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmFinalize, setConfirmFinalize] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [rates, next, customerRows] = await Promise.all([
          api.getLatestMetalRates(),
          purchase ? Promise.resolve({ purchaseNo: purchase.purchaseNo }) : api.getNextOldGoldPurchaseNo(),
          api.listCustomers().catch(() => [] as Customer[]),
        ])
        if (!active) return
        setCustomers(customerRows)
        setMetalRates(rates)
        setPreviewNo(next.purchaseNo)
        if (!purchase) {
          setRows((current) =>
            current.map((row) => ({
              ...row,
              ratePerGram: row.ratePerGram || rates?.gold22k || '',
            })),
          )
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load form')
      }
    })()
    return () => {
      active = false
    }
  }, [purchase])

  const selectedCustomer = customers.find((customer) => customer.id === customerId)
  const liveTotal = useMemo(
    () =>
      toOldGoldInputs(rows).reduce(
        (sum, item) =>
          sum +
          computeOldGoldValue({
            netWeight: item.netWeight,
            ratePerGram: item.ratePerGram,
            deductionPct: item.deductionPct,
          }).finalValue,
        0,
      ),
    [rows],
  )

  function applyCustomer(customer: Customer) {
    setCustomerId(customer.id)
    setCustomerName(customer.name ?? '')
    setCustomerPhone(customer.phone ?? '')
    setError(null)
  }

  function clearCustomer() {
    setCustomerId(0)
    setCustomerName('')
    setCustomerPhone('')
  }

  async function persist(finalize: boolean) {
    if (readOnly) return
    const name = customerName.trim()
    if (!name) {
      setError('Enter a customer name')
      return
    }
    const items = toOldGoldInputs(rows)
    if (items.length === 0) {
      setError('Add at least one old gold item with weight')
      return
    }
    try {
      setSaving(true)
      setError(null)
      const payload = {
        customerId: customerId > 0 ? customerId : null,
        customerName: name,
        customerPhone: customerPhone.replace(/\D/g, '').slice(0, 10),
        purchaseDate,
        notes,
        items,
      }
      const saved =
        purchaseId == null
          ? await api.createOldGoldPurchase(payload)
          : await api.updateOldGoldPurchase({ ...payload, id: purchaseId })
      setPurchaseId(saved.id)
      if (finalize) {
        await api.finalizeOldGoldPurchase(saved.id)
        showToast('Old gold purchase finalized', 'success')
      } else {
        showToast(purchaseId == null ? 'Draft saved' : 'Draft updated', 'success')
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save old gold purchase')
    } finally {
      setSaving(false)
      setConfirmFinalize(false)
    }
  }

  const title = readOnly
    ? `Old gold ${purchase?.purchaseNo ?? ''}`
    : purchaseId == null
      ? 'New old gold purchase'
      : `Edit ${purchase?.purchaseNo ?? previewNo}`
  const displayNo = purchase?.purchaseNo || previewNo || '…'

  return (
    <>
      <Modal className="modal-wide product-form-modal" title={title} hideTitle footer={null} onClose={onClose}>
        <div className="product-form-shell">
          <header className="product-form-header">
            <div className="product-form-header-copy">
              <span className="product-form-header-icon" aria-hidden>
                <Coins size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>Record old gold bought from a customer. This does not add stock to Purchase.</p>
              </div>
            </div>
            <button
              type="button"
              className="btn ghost icon-btn product-form-close"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </header>

          <div className="product-form-layout">
            {error ? <div className="error-banner product-form-banner">{error}</div> : null}

            <section className="product-section">
              <div className="product-section-head">
                <span className="product-section-step" aria-hidden>
                  1
                </span>
                <div>
                  <h3>Purchase details</h3>
                  <p>Bill {displayNo}</p>
                </div>
              </div>
              <div className="product-form-grid-2">
                <Field label="Customer">
                  <BillCustomerSearch
                    customers={customers}
                    customerId={customerId}
                    disabled={readOnly}
                    hideLabel
                    onSelect={applyCustomer}
                    onClear={clearCustomer}
                    onCustomerCreated={(customer) => {
                      setCustomers((current) => [customer, ...current])
                      applyCustomer(customer)
                    }}
                    onError={setError}
                  />
                </Field>
                <Field label="Date">
                  <Control icon={<Calendar size={14} strokeWidth={1.75} />}>
                    <DateInput
                      className="input"
                      value={purchaseDate}
                      disabled={readOnly}
                      onChange={setPurchaseDate}
                    />
                  </Control>
                </Field>
                <Field label="Customer name" htmlFor="ogp-name">
                  <Control icon={<User size={14} strokeWidth={1.75} />}>
                    <input
                      id="ogp-name"
                      className="input"
                      value={customerName}
                      disabled={readOnly || Boolean(selectedCustomer)}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="Name"
                    />
                  </Control>
                </Field>
                <Field label="Phone" htmlFor="ogp-phone">
                  <Control icon={<Phone size={14} strokeWidth={1.75} />}>
                    <input
                      id="ogp-phone"
                      className="input"
                      value={customerPhone}
                      disabled={readOnly || Boolean(selectedCustomer)}
                      onChange={(event) => setCustomerPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Phone"
                    />
                  </Control>
                </Field>
              </div>
              <Field label="Notes" htmlFor="ogp-notes">
                <Control icon={<StickyNote size={14} strokeWidth={1.75} />}>
                  <input
                    id="ogp-notes"
                    className="input"
                    value={notes}
                    disabled={readOnly}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional notes"
                  />
                </Control>
              </Field>
            </section>

            <section className="product-section">
              <OldGoldEditor
                rows={rows}
                metalRates={metalRates}
                disabled={readOnly}
                layout="purchase"
                title="Purchase items"
                subtitle="Weight, purity, rate, and deduction"
                emptyHint="Add the old gold the customer is selling."
                addLabel="Add item"
                onChange={setRows}
              />
            </section>
          </div>

          <footer className="product-form-footer">
            <p className="product-form-tip">
              Total {formatCurrency(liveTotal)}. Finalize does not add stock to Purchase.
            </p>
            <div className="product-form-footer-actions">
              <button type="button" className="btn secondary" onClick={onClose}>
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              {readOnly ? null : (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={saving}
                    onClick={() => void persist(false)}
                  >
                    {saving ? 'Saving…' : 'Save draft'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={saving}
                    onClick={() => setConfirmFinalize(true)}
                  >
                    Save & finalize
                  </button>
                </>
              )}
            </div>
          </footer>
        </div>
      </Modal>

      {confirmFinalize ? (
        <Modal
          title="Finalize old gold purchase?"
          onClose={() => setConfirmFinalize(false)}
          footer={
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={saving}
                onClick={() => setConfirmFinalize(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn" disabled={saving} onClick={() => void persist(true)}>
                {saving ? 'Saving…' : 'Finalize'}
              </button>
            </div>
          }
        >
          <p className="confirm-dialog-copy">
            Finalizing records this purchase so it can be applied to a sale bill. It does not add stock to
            Purchase. A finalized purchase cannot be edited.
          </p>
        </Modal>
      ) : null}
    </>
  )
}
