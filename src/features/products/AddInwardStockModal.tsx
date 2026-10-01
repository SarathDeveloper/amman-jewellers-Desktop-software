import { useEffect, useMemo, useState, Fragment } from 'react'
import { Plus } from 'lucide-react'
import { GOLD_PURITIES, SILVER_PURITIES } from '@shared/itemTypes'
import { localTodayIso } from '@shared/localDate'
import type { InwardItemInput, Product, Supplier } from '@shared/types'
import { Modal } from '../../components/Modal'
import { DateInput } from '../../components/DateInput'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatCurrency, formatWeight } from '../../lib/format'
import { numericFieldToNumber, parseNumericField, type NumericField } from '../../lib/numericField'
import { SupplierFormModal } from '../suppliers/SupplierFormModal'
import { HuidEntryList, resizeHuidRows } from './HuidEntryList'
import { isSilver } from './productDisplay'

type LineState = {
  productId: number
  qty: NumericField
  netWeight: NumericField
  rate: NumericField
  purity: string
  huids: string[]
}

function puritiesForMetal(metal: string, current: string): string[] {
  const preferred = isSilver(metal) ? [...SILVER_PURITIES] : [...GOLD_PURITIES]
  if (current && !preferred.includes(current as (typeof preferred)[number])) {
    return [...preferred, current]
  }
  return preferred
}

function linesFromProducts(products: Product[]): LineState[] {
  return products.map((product) => ({
    productId: product.id,
    qty: 1,
    netWeight: product.netWeight || '',
    rate: '',
    purity: product.purity || (isSilver(product.metal) ? SILVER_PURITIES[0] : '22K'),
    huids: [''],
  }))
}

export function AddInwardStockModal({
  products,
  onClose,
  onSaved,
}: {
  products: Product[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const { showToast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [inwardDate, setInwardDate] = useState(localTodayIso())
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineState[]>(() => linesFromProducts(products))
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLines(linesFromProducts(products))
    setInwardDate(localTodayIso())
    setNotes('')
    setError(null)
  }, [products])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const rows = await api.listSuppliers()
        if (!active) return
        setSuppliers(rows)
        setSupplierId((current) => current || (rows[0]?.id ?? ''))
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load suppliers')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])

  const totals = useMemo(() => {
    let weight = 0
    let amount = 0
    for (const line of lines) {
      const qty = Math.max(1, numericFieldToNumber(line.qty, 1))
      const netWeight = numericFieldToNumber(line.netWeight)
      const rate = numericFieldToNumber(line.rate)
      weight += netWeight * qty
      amount += netWeight * qty * rate
    }
    return { weight, amount }
  }, [lines])

  function updateLine(productId: number, patch: Partial<LineState>) {
    setLines((current) =>
      current.map((line) => (line.productId === productId ? { ...line, ...patch } : line)),
    )
    setError(null)
  }

  function buildItems(): InwardItemInput[] {
    return lines.map((line) => {
      const product = productById.get(line.productId)
      if (!product) {
        throw new Error('Product is no longer available')
      }
      const qty = Math.max(1, Math.trunc(numericFieldToNumber(line.qty, 1)))
      const netWeight = numericFieldToNumber(line.netWeight)
      if (netWeight <= 0) {
        throw new Error(`${product.name} needs a net weight greater than 0`)
      }
      const huids = line.huids.map((value) => value.trim().toUpperCase()).filter(Boolean)
      if (huids.length !== qty) {
        throw new Error('Add one HUID for each piece on this line')
      }
      const duplicate = huids.find((huid, index) => huids.indexOf(huid) !== index)
      if (duplicate) {
        throw new Error(`HUID ${duplicate} is duplicated`)
      }
      return {
        productId: product.id,
        metal: product.metal,
        category: product.category,
        purity: line.purity || product.purity,
        qty,
        netWeight,
        rate: numericFieldToNumber(line.rate),
        huids,
      }
    })
  }

  async function save() {
    if (supplierId === '') {
      setError('Select a supplier')
      return
    }
    try {
      setSaving(true)
      setError(null)
      const items = buildItems()
      const saved = await api.createInward({
        supplierId: Number(supplierId),
        inwardDate,
        notes,
        items,
      })
      try {
        await api.finalizeInward(saved.id)
      } catch (err) {
        await api.deleteInward(saved.id).catch(() => undefined)
        throw err
      }
      showToast('Inward finalized — stock updated', 'success')
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add inward stock')
    } finally {
      setSaving(false)
    }
  }

  const title = products.length === 1 ? `Add inward stock — ${products[0].name}` : `Add inward stock — ${products.length} products`

  return (
    <>
      <Modal
        className="inward-stock-modal"
        title={title}
        onClose={onClose}
        footer={
          <div className="modal-actions">
            <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Add inward stock'}
            </button>
          </div>
        }
      >
        <div className="product-form">
          {error ? <div className="error-banner product-form-banner">{error}</div> : null}

          <div className="form-grid">
            <label>
              Supplier
              <div className="inward-supplier-row">
                <select
                  className="input"
                  value={supplierId}
                  onChange={(event) =>
                    setSupplierId(event.target.value ? Number(event.target.value) : '')
                  }
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn secondary" onClick={() => setSupplierModalOpen(true)}>
                  <Plus size={16} aria-hidden />
                  New
                </button>
              </div>
            </label>
            <label>
              Date
              <DateInput className="input" value={inwardDate} onChange={setInwardDate} />
            </label>
            <label className="full">
              Notes
              <input
                className="input"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Metal</th>
                  <th>Category</th>
                  <th>Purity</th>
                  <th className="num">Qty</th>
                  <th className="num">Net wt (g)</th>
                  <th className="num">Rate</th>
                  <th className="num">Line</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const product = productById.get(line.productId)
                  if (!product) return null
                  const qty = Math.max(1, numericFieldToNumber(line.qty, 1))
                  const netWeight = numericFieldToNumber(line.netWeight)
                  const rate = numericFieldToNumber(line.rate)
                  const purities = puritiesForMetal(product.metal, line.purity)
                  return (
                    <Fragment key={line.productId}>
                    <tr>
                      <td>{product.name}</td>
                      <td>{product.metal}</td>
                      <td>{product.category || '—'}</td>
                      <td>
                        <select
                          className="input"
                          value={line.purity}
                          onChange={(event) => updateLine(line.productId, { purity: event.target.value })}
                        >
                          {purities.map((purity) => (
                            <option key={purity} value={purity}>
                              {purity}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="num">
                        <input
                          className="input num"
                          type="number"
                          min={1}
                          value={line.qty}
                          onChange={(event) => {
                            const qty = parseNumericField(event.target.value)
                            const n = Math.max(1, Math.trunc(numericFieldToNumber(qty, 1)))
                            updateLine(line.productId, {
                              qty,
                              huids: resizeHuidRows(line.huids, n),
                            })
                          }}
                        />
                      </td>
                      <td className="num">
                        <input
                          className="input num"
                          type="number"
                          step="0.001"
                          min={0}
                          value={line.netWeight}
                          onChange={(event) =>
                            updateLine(line.productId, {
                              netWeight: parseNumericField(event.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        <input
                          className="input num"
                          type="number"
                          step="0.01"
                          min={0}
                          value={line.rate}
                          onChange={(event) =>
                            updateLine(line.productId, { rate: parseNumericField(event.target.value) })
                          }
                        />
                      </td>
                      <td className="num">{formatCurrency(netWeight * qty * rate)}</td>
                    </tr>
                    <tr key={`${line.productId}-huids`}>
                      <td colSpan={8}>
                        <p className="muted">
                          HUID (Hallmark Unique ID) — {line.huids.filter((value) => value.trim()).length} of{' '}
                          {Math.max(1, Math.trunc(qty))} pieces
                        </p>
                        <HuidEntryList
                          values={line.huids}
                          onChange={(huids) => updateLine(line.productId, { huids })}
                        />
                      </td>
                    </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="muted">
            Total weight {formatWeight(totals.weight)} · Total amount {formatCurrency(totals.amount)}
          </p>
        </div>
      </Modal>

      <SupplierFormModal
        open={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        onSaved={(supplier) => {
          setSuppliers((current) => [supplier, ...current])
          setSupplierId(supplier.id)
          showToast('Supplier added', 'success')
        }}
        onError={(message) => setError(message)}
      />
    </>
  )
}
