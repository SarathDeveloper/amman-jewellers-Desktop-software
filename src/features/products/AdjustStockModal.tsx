import { useMemo, useState } from 'react'
import { Calculator, X } from 'lucide-react'
import { huidRemovalRange, newPieceHuidError } from '@shared/itemTypes'
import { localTodayIso } from '@shared/localDate'
import type { Product } from '@shared/types'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { productHasVariants, variantDisplayName } from './productDisplay'
import { HuidEntryList, resizeHuidRows } from './HuidEntryList'

type Direction = 'add' | 'reduce'

export function AdjustStockModal({
  product,
  allProducts,
  onClose,
  onSaved,
}: {
  product: Product
  allProducts: Product[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const { showToast } = useToast()
  const [date, setDate] = useState(localTodayIso())
  const [direction, setDirection] = useState<Direction>('add')
  const [qtyRaw, setQtyRaw] = useState('0')
  const [remarks, setRemarks] = useState('')
  const [huids, setHuids] = useState<string[]>([])
  const [removedHuids, setRemovedHuids] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const itemName = variantDisplayName(product)
  const currentStock = product.stockQty
  const hasVariants = productHasVariants(allProducts, product.id)

  const qty = useMemo(() => {
    const parsed = Number(qtyRaw)
    if (!Number.isFinite(parsed) || parsed < 0) return 0
    return Math.trunc(parsed)
  }, [qtyRaw])

  const qtyDelta = direction === 'add' ? qty : -qty
  const newStock = currentStock + qtyDelta
  const existingHuids = product.huids ?? []
  const removeRange =
    direction === 'reduce'
      ? huidRemovalRange(existingHuids.length, currentStock, qty)
      : { min: 0, max: 0 }

  const validationError = useMemo(() => {
    if (!date.trim()) return 'Date is required'
    if (qty <= 0) return 'Enter a quantity greater than 0'
    if (newStock < 0) return `Cannot reduce below 0 pcs (current stock is ${currentStock})`
    if (direction === 'add') {
      const filled = huids.map((value) => value.trim().toUpperCase()).filter(Boolean)
      const countError = newPieceHuidError(filled.length, qty)
      if (countError) return countError
      const duplicate = filled.find((huid, index) => filled.indexOf(huid) !== index)
      if (duplicate) return `HUID ${duplicate} is duplicated`
    }
    if (direction === 'reduce' && existingHuids.length > 0) {
      if (removeRange.min === removeRange.max && removedHuids.length !== removeRange.max) {
        return removeRange.max === 1 ? 'Select 1 HUID to remove' : `Select ${removeRange.max} HUIDs to remove`
      }
      if (removedHuids.length < removeRange.min) {
        return removeRange.min === 1
          ? 'Select at least 1 HUID to remove'
          : `Select at least ${removeRange.min} HUIDs to remove`
      }
    }
    return null
  }, [
    date,
    qty,
    newStock,
    currentStock,
    direction,
    huids,
    existingHuids.length,
    removedHuids.length,
    removeRange.min,
    removeRange.max,
  ])

  const shownError = error ?? (qty > 0 && newStock < 0 ? validationError : null)

  async function save() {
    if (validationError) {
      setError(validationError)
      return
    }
    try {
      setSaving(true)
      setError(null)
      await api.createStockAdjustment({
        adjustmentDate: date,
        reason: direction === 'add' ? 'Stock addition' : 'Stock reduction',
        note: remarks.trim(),
        lines: [
          {
            productId: product.id,
            metal: product.metal,
            category: product.category,
            qtyDelta,
            weightDelta: qtyDelta * product.netWeight,
            huids:
              direction === 'add'
                ? huids.map((value) => value.trim().toUpperCase()).filter(Boolean)
                : removedHuids,
          },
        ],
      })
      showToast(
        direction === 'add' ? `Added ${qty} pcs to ${itemName}` : `Reduced ${qty} pcs from ${itemName}`,
        'success',
      )
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust stock')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      className="adjust-stock-modal"
      title="Adjust Stock Quantity"
      hideTitle
      footer={null}
      onClose={onClose}
    >
      <header className="adjust-stock-header">
        <h2>Adjust Stock Quantity</h2>
        <button
          type="button"
          className="btn ghost icon-btn product-form-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      <div className="adjust-stock-body">
        {shownError ? <div className="error-banner product-form-banner">{shownError}</div> : null}

        <div className="adjust-stock-layout">
          <div className="adjust-stock-fields">
            <label>
              Date
              <DateInput
                className="input"
                value={date}
                onChange={(value) => {
                  setDate(value)
                  setError(null)
                }}
              />
            </label>

            <div className="adjust-stock-qty-row">
              <label>
                Add or Reduce Stock
                <select
                  className="select"
                  value={direction}
                  onChange={(event) => {
                    setDirection(event.target.value as Direction)
                    setError(null)
                    setRemovedHuids([])
                    setHuids((current) =>
                      event.target.value === 'add'
                        ? resizeHuidRows(current, Math.max(0, Math.trunc(Number(qtyRaw) || 0)))
                        : [],
                    )
                  }}
                >
                  <option value="add">Add (+)</option>
                  <option value="reduce">Reduce (−)</option>
                </select>
              </label>
              <label>
                Adjust quantity
                <span className="adjust-stock-qty-input">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={qtyRaw}
                    onChange={(event) => {
                    setQtyRaw(event.target.value)
                    setError(null)
                    const nextQty = Math.max(0, Math.trunc(Number(event.target.value) || 0))
                    setHuids((current) => resizeHuidRows(current, nextQty))
                  }}
                  />
                  <span className="adjust-stock-qty-unit">pcs</span>
                </span>
              </label>
            </div>

            <label>
              Remarks (Optional)
              <textarea
                className="textarea"
                rows={3}
                placeholder="Enter remarks"
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
            </label>

          {direction === 'add' && qty > 0 ? (
            <div>
              <p className="muted">
                HUID (Hallmark Unique ID) for new pieces · optional
              </p>
              <HuidEntryList values={resizeHuidRows(huids, qty)} onChange={setHuids} />
            </div>
          ) : null}

          {direction === 'reduce' && qty > 0 && existingHuids.length > 0 ? (
            <fieldset className="product-attr-editor">
              <legend className="product-attr-head">Select HUIDs to remove</legend>
              {existingHuids.map((huid) => {
                const checked = removedHuids.includes(huid)
                const disableUnchecked = !checked && removedHuids.length >= removeRange.max
                return (
                  <label key={huid} className="product-form-toggle">
                    <input
                      type="checkbox"
                      aria-label={huid}
                      checked={checked}
                      disabled={disableUnchecked}
                      onChange={(event) => {
                        setRemovedHuids((current) =>
                          event.target.checked
                            ? [...current, huid]
                            : current.filter((value) => value !== huid),
                        )
                        setError(null)
                      }}
                    />
                    <span>
                      <strong>{huid}</strong>
                    </span>
                  </label>
                )
              })}
            </fieldset>
          ) : null}
          </div>

          <aside className="adjust-stock-panel">
            <div className="adjust-stock-item">
              <span className="adjust-stock-panel-label">Item Name</span>
              <strong>{itemName}</strong>
            </div>
            <div className="adjust-stock-calc">
              <h3>
                <Calculator size={16} strokeWidth={1.75} aria-hidden />
                Stock Calculation
              </h3>
              <dl>
                <div>
                  <dt>Current Stock</dt>
                  <dd className="num">{currentStock} pcs</dd>
                </div>
                <div>
                  <dt>Adjustment</dt>
                  <dd className={`num${qty > 0 ? (direction === 'add' ? ' is-add' : ' is-reduce') : ''}`}>
                    {qty > 0 ? `${direction === 'add' ? '+' : '−'}${qty} pcs` : '0 pcs'}
                  </dd>
                </div>
                <div className="adjust-stock-calc-total">
                  <dt>New Stock</dt>
                  <dd className={`num${newStock < 0 ? ' is-reduce' : ''}`}>{newStock} pcs</dd>
                </div>
              </dl>
              {hasVariants ? (
                <p className="muted adjust-stock-note">
                  This design has variants. The adjustment applies to this item only, not rolled-up variant
                  stock.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="btn"
          disabled={saving || Boolean(validationError)}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
