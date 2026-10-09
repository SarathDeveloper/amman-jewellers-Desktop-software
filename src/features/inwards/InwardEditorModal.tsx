import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Calendar,
  ClipboardList,
  Coins,
  FolderKanban,
  Hash,
  Lightbulb,
  Package,
  Plus,
  Printer,
  Save,
  Shield,
  StickyNote,
  Trash2,
  Truck,
  Weight,
  X,
} from 'lucide-react'
import {
  GOLD_PURITIES,
  isHuidMandatory,
  newPieceHuidError,
  SILVER_PURITIES,
  STOCK_ITEM_NAMES,
  STOCK_METALS,
} from '@shared/itemTypes'
import { computePurchaseTotals } from '@shared/billing/billSummary'
import { computePurchaseLineAmount, DEFAULT_HSN } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import type { Inward, InwardItemInput, Product, PurchasePaymentMode, Supplier } from '@shared/types'
import { Modal } from '../../components/Modal'
import { DateInput } from '../../components/DateInput'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatCurrency, formatWeight } from '../../lib/format'
import { numericFieldToNumber, parseNumericField, type NumericField } from '../../lib/numericField'
import { isSilver } from '../products/productDisplay'
import { HuidEntryList, resizeHuidRows } from '../products/HuidEntryList'
import { SupplierFormModal } from '../suppliers/SupplierFormModal'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'

type LineKind = 'product' | 'raw'

type LineState = {
  key: string
  kind: LineKind
  productId: number | ''
  metal: string
  category: string
  purity: string
  qty: NumericField
  grossWeight: NumericField
  netWeight: NumericField
  rate: NumericField
  makingCharges: NumericField
  hsnCode: string
  huids: string[]
}

let lineSeq = 0

function nextKey(): string {
  lineSeq += 1
  return `line-${lineSeq}`
}

function puritiesForMetal(metal: string, current: string): string[] {
  const preferred = isSilver(metal) ? [...SILVER_PURITIES] : [...GOLD_PURITIES]
  if (current && !preferred.includes(current as (typeof preferred)[number])) {
    return [...preferred, current]
  }
  return preferred
}

function blankProductLine(): LineState {
  return {
    key: nextKey(),
    kind: 'product',
    productId: '',
    metal: 'Gold',
    category: '',
    purity: '22K',
    qty: 1,
    grossWeight: '',
    netWeight: '',
    rate: '',
    makingCharges: '',
    hsnCode: DEFAULT_HSN,
    huids: [''],
  }
}

function blankRawLine(category: string): LineState {
  return {
    key: nextKey(),
    kind: 'raw',
    productId: '',
    metal: 'Gold',
    category: category || STOCK_ITEM_NAMES[0],
    purity: '22K',
    qty: 1,
    grossWeight: '',
    netWeight: '',
    rate: '',
    makingCharges: '',
    hsnCode: DEFAULT_HSN,
    huids: [],
  }
}

function lineFromProduct(product: Product): LineState {
  return {
    ...blankProductLine(),
    productId: product.id,
    metal: product.metal,
    category: product.category,
    purity: product.purity || (isSilver(product.metal) ? SILVER_PURITIES[0] : '22K'),
    grossWeight: product.grossWeight || '',
    netWeight: product.netWeight || '',
    makingCharges: product.makingCharges || '',
  }
}

function linesFromInward(inward: Inward): LineState[] {
  return inward.items.map((item) => ({
    key: nextKey(),
    kind: item.productId == null ? 'raw' : 'product',
    productId: item.productId ?? '',
    metal: item.metal,
    category: item.category,
    purity: item.purity,
    qty: item.qty,
    grossWeight: item.grossWeight || '',
    netWeight: item.netWeight,
    rate: item.rate,
    makingCharges: item.makingCharges || '',
    hsnCode: item.hsnCode || DEFAULT_HSN,
    huids:
      item.productId == null
        ? []
        : resizeHuidRows(item.huids ?? [], item.qty),
  }))
}

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
  unit,
  children,
}: {
  icon?: ReactNode
  unit?: string
  children: ReactNode
}) {
  const classes = ['product-form-control', icon ? 'has-icon' : '', unit ? 'has-unit' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes}>
      {icon ? (
        <span className="product-form-lead-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
      {unit ? (
        <span className="product-form-unit" aria-hidden>
          {unit}
        </span>
      ) : null}
    </div>
  )
}

function SectionHead({
  step,
  title,
  subtitle,
}: {
  step?: number
  title: string
  subtitle: string
}) {
  return (
    <div className="product-section-head">
      {step != null ? (
        <span className="product-section-step" aria-hidden>
          {step}
        </span>
      ) : null}
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </div>
  )
}

function StaticValue({ children }: { children: ReactNode }) {
  return <div className="inward-line-static">{children}</div>
}

export function InwardEditorModal({
  inward,
  readOnly,
  initialProducts,
  onClose,
  onSaved,
}: {
  inward: Inward | null
  readOnly: boolean
  /** Pre-fills one product line per product for a new purchase. */
  initialProducts?: Product[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const { showToast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([...STOCK_ITEM_NAMES])
  const [supplierId, setSupplierId] = useState<number | ''>(inward?.supplierId ?? '')
  const [inwardDate, setInwardDate] = useState(inward?.inwardDate ?? localTodayIso())
  const [notes, setNotes] = useState(inward?.notes ?? '')
  const [paymentMode, setPaymentMode] = useState<PurchasePaymentMode>(inward?.paymentMode ?? 'cash')
  const [roundOff, setRoundOff] = useState<NumericField>(inward?.roundOff ?? 0)
  const [roundOffTouched, setRoundOffTouched] = useState(inward != null)
  const [lines, setLines] = useState<LineState[]>(() => {
    if (inward) return linesFromInward(inward)
    if (initialProducts && initialProducts.length > 0) return initialProducts.map(lineFromProduct)
    return [blankProductLine()]
  })
  const [inwardId, setInwardId] = useState<number | null>(inward?.id ?? null)
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [supplierRows, productRows] = await Promise.all([api.listSuppliers(), api.listProducts()])
        if (!active) return
        setSuppliers(supplierRows)
        setProducts(productRows)
        if (!inward) {
          setSupplierId((current) => current || (supplierRows[0]?.id ?? ''))
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load purchase form')
      }
      try {
        const categoryRows = await api.listStockCategories()
        if (!active) return
        if (categoryRows.length > 0) {
          setCategories(categoryRows.map((row) => row.name))
        }
      } catch {
        // Stock permission may be absent; seeded category names still match the ledger.
      }
    })()
    return () => {
      active = false
    }
  }, [inward])

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])

  const liveTotals = useMemo(() => {
    let weight = 0
    const lineAmounts: number[] = []
    for (const line of lines) {
      const qty = Math.max(1, numericFieldToNumber(line.qty, 1))
      const netWeight = numericFieldToNumber(line.netWeight)
      const rate = numericFieldToNumber(line.rate)
      const makingCharges = numericFieldToNumber(line.makingCharges)
      weight += netWeight * qty
      lineAmounts.push(computePurchaseLineAmount({ qty, netWeight, rate, makingCharges }))
    }
    const totals = computePurchaseTotals(
      lineAmounts,
      roundOffTouched ? numericFieldToNumber(roundOff) : undefined,
    )
    return { weight, ...totals }
  }, [lines, roundOff, roundOffTouched])

  const displayTotals =
    readOnly && inward
      ? {
          weight: liveTotals.weight,
          subtotal: inward.subtotal,
          cgst: inward.cgst,
          sgst: inward.sgst,
          igst: inward.igst,
          roundOff: inward.roundOff,
          total: inward.total,
        }
      : liveTotals

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
    setError(null)
  }

  function selectProduct(key: string, productId: number | '') {
    const product = productId === '' ? undefined : productById.get(productId)
    const current = lines.find((line) => line.key === key)
    const n = Math.max(1, Math.trunc(numericFieldToNumber(current?.qty ?? 1, 1)))
    updateLine(key, {
      productId,
      metal: product?.metal ?? 'Gold',
      category: product?.category ?? '',
      purity: product?.purity || (product && isSilver(product.metal) ? SILVER_PURITIES[0] : '22K'),
      grossWeight: product ? product.grossWeight || '' : '',
      netWeight: product ? product.netWeight || '' : '',
      makingCharges: product ? product.makingCharges || '' : '',
      hsnCode: DEFAULT_HSN,
      huids: product ? resizeHuidRows(current?.huids ?? [], n) : [],
    })
  }

  function buildItems(finalize: boolean): InwardItemInput[] {
    if (lines.length === 0) {
      throw new Error('Add at least one line')
    }
    const huidsSeen: string[] = []
    return lines.map((line, index) => {
      const qty = Math.max(1, Math.trunc(numericFieldToNumber(line.qty, 1)))
      const netWeight = numericFieldToNumber(line.netWeight)
      const label = `Line ${index + 1}`
      if (netWeight <= 0) {
        throw new Error(`${label} needs a net weight greater than 0`)
      }
      if (line.kind === 'product') {
        const product = line.productId === '' ? undefined : productById.get(line.productId)
        if (!product) {
          throw new Error(`${label} needs a product`)
        }
        const huids = line.huids.map((value) => value.trim().toUpperCase()).filter(Boolean)
        const countError = finalize
          ? newPieceHuidError(product.metal, huids.length, qty)
          : huids.length > qty
            ? 'A line cannot have more HUIDs than pieces'
            : null
        if (countError) {
          throw new Error(`${label} (${product.name}): ${countError}`)
        }
        const invalid = huids.find((huid) => !/^[0-9A-Z]{6}$/.test(huid))
        if (invalid) {
          throw new Error(`${label}: HUID ${invalid} must be 6 letters or digits`)
        }
        const duplicate = huids.find(
          (huid, index) => huids.indexOf(huid) !== index || huidsSeen.includes(huid),
        )
        if (duplicate) {
          throw new Error(`HUID ${duplicate} is duplicated`)
        }
        huidsSeen.push(...huids)
        return {
          productId: product.id,
          metal: product.metal,
          category: product.category,
          purity: line.purity || product.purity,
          qty,
          grossWeight: numericFieldToNumber(line.grossWeight),
          netWeight,
          rate: numericFieldToNumber(line.rate),
          makingCharges: numericFieldToNumber(line.makingCharges),
          hsnCode: line.hsnCode.trim() || DEFAULT_HSN,
          huids,
        }
      }
      if (!line.metal.trim() || !line.category.trim()) {
        throw new Error(`${label} needs a metal and category`)
      }
      return {
        productId: null,
        metal: line.metal,
        category: line.category,
        purity: line.purity,
        qty,
        grossWeight: numericFieldToNumber(line.grossWeight),
        netWeight,
        rate: numericFieldToNumber(line.rate),
        makingCharges: numericFieldToNumber(line.makingCharges),
        hsnCode: line.hsnCode.trim() || DEFAULT_HSN,
        huids: [],
      }
    })
  }

  async function persist(finalize: boolean) {
    if (readOnly) return
    if (supplierId === '') {
      setError('Select a supplier')
      return
    }
    try {
      setSaving(true)
      setError(null)
      const payload = {
        supplierId: Number(supplierId),
        inwardDate,
        notes,
        paymentMode,
        roundOff: liveTotals.roundOff,
        items: buildItems(finalize),
      }
      const saved =
        inwardId == null
          ? await api.createInward(payload)
          : await api.updateInward({ ...payload, id: inwardId })
      setInwardId(saved.id)
      if (finalize) {
        await api.finalizeInward(saved.id)
        showToast('Purchase finalized — stock updated', 'success')
      } else {
        showToast(inwardId == null ? 'Draft saved' : 'Draft updated', 'success')
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save purchase')
    } finally {
      setSaving(false)
      setConfirmFinalize(false)
    }
  }

  const title = readOnly
    ? `Purchase ${inward?.inwardNo ?? ''}`
    : inwardId == null
      ? 'New purchase'
      : `Edit ${inward?.inwardNo ?? 'draft'}`
  const subtitle = 'Purchase stock. Finalize to update product pieces and gold & silver weight.'

  return (
    <>
      <Modal className="modal-wide product-form-modal" title={title} hideTitle footer={null} onClose={onClose}>
        <div className="product-form-shell">
          <header className="product-form-header">
            <div className="product-form-header-copy">
              <span className="product-form-header-icon" aria-hidden>
                <ClipboardList size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{subtitle}</p>
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
              <SectionHead
                step={1}
                title="Purchase details"
                subtitle="Supplier, date, and notes"
              />
              <div className="product-form-grid-3">
                <Field label="Supplier" htmlFor="inward-supplier">
                  <div className="inward-supplier-row">
                    <Control icon={<Truck size={14} strokeWidth={1.75} />}>
                      <select
                        id="inward-supplier"
                        className="select"
                        value={supplierId}
                        disabled={readOnly}
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
                    </Control>
                    {readOnly ? null : (
                      <button type="button" className="btn secondary" onClick={() => setSupplierModalOpen(true)}>
                        <Plus size={16} aria-hidden />
                        New
                      </button>
                    )}
                  </div>
                </Field>
                <Field label="Date">
                  <Control icon={<Calendar size={14} strokeWidth={1.75} />}>
                    <DateInput
                      className="input"
                      value={inwardDate}
                      disabled={readOnly}
                      onChange={setInwardDate}
                    />
                  </Control>
                </Field>
                <Field label="Payment" htmlFor="inward-payment">
                  <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                    <select
                      id="inward-payment"
                      className="select"
                      value={paymentMode}
                      disabled={readOnly}
                      onChange={(event) => setPaymentMode(event.target.value as PurchasePaymentMode)}
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                    </select>
                  </Control>
                </Field>
              </div>
              <Field label="Notes">
                <Control icon={<StickyNote size={14} strokeWidth={1.75} />}>
                  <input
                    className="input"
                    value={notes}
                    disabled={readOnly}
                    placeholder="Optional reference or remarks"
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Control>
              </Field>
            </section>

            <section className="product-section">
              <div className="inward-lines-head">
                <SectionHead
                  step={2}
                  title="Purchase lines"
                  subtitle="Products and raw metal on this purchase"
                />
                {readOnly ? null : (
                  <div className="inward-lines-actions">
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setLines((current) => [...current, blankProductLine()])}
                    >
                      <Plus size={14} strokeWidth={2} aria-hidden />
                      Product line
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setLines((current) => [...current, blankRawLine(categories[0] ?? '')])}
                    >
                      <Plus size={14} strokeWidth={2} aria-hidden />
                      Raw metal
                    </button>
                  </div>
                )}
              </div>

              <div className="inward-line-list">
                {lines.map((line) => {
                  const product = line.productId === '' ? undefined : productById.get(line.productId)
                  const metal = line.kind === 'product' ? (product?.metal ?? line.metal) : line.metal
                  const qty = Math.max(1, numericFieldToNumber(line.qty, 1))
                  const netWeight = numericFieldToNumber(line.netWeight)
                  const rate = numericFieldToNumber(line.rate)
                  const makingCharges = numericFieldToNumber(line.makingCharges)
                  const grossWeight = numericFieldToNumber(line.grossWeight)
                  const lineAmount = computePurchaseLineAmount({
                    qty,
                    netWeight,
                    rate,
                    makingCharges,
                  })
                  const purities = puritiesForMetal(metal, line.purity)
                  const categoryValue = line.kind === 'product' ? product?.category || line.category || '—' : line.category
                  const categoryOptions =
                    categories.includes(line.category) || !line.category
                      ? categories
                      : [line.category, ...categories]

                  return (
                    <article key={line.key} className="inward-line-card">
                      <div className="inward-line-card-head">
                        <span className="inward-line-kind">
                          {line.kind === 'product' ? 'Product' : 'Raw metal'}
                        </span>
                        <span className="inward-line-amount">{formatCurrency(lineAmount)}</span>
                        {readOnly ? null : (
                          <button
                            type="button"
                            className="btn ghost icon-btn"
                            aria-label="Remove line"
                            onClick={() =>
                              setLines((current) => current.filter((item) => item.key !== line.key))
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      <div className="product-form-grid-3">
                        {line.kind === 'product' ? (
                          <Field label="Product">
                            {readOnly ? (
                              <Control icon={<Package size={14} strokeWidth={1.75} />}>
                                <StaticValue>{product?.name ?? 'Product'}</StaticValue>
                              </Control>
                            ) : (
                              <Control icon={<Package size={14} strokeWidth={1.75} />}>
                                <select
                                  className="select"
                                  aria-label="Product"
                                  value={line.productId}
                                  onChange={(event) =>
                                    selectProduct(
                                      line.key,
                                      event.target.value ? Number(event.target.value) : '',
                                    )
                                  }
                                >
                                  <option value="">Select product</option>
                                  {products.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
                              </Control>
                            )}
                          </Field>
                        ) : (
                          <Field label="Metal">
                            {readOnly ? (
                              <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                                <StaticValue>{line.metal}</StaticValue>
                              </Control>
                            ) : (
                              <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                                <select
                                  className="select"
                                  aria-label="Metal"
                                  value={line.metal}
                                  onChange={(event) => {
                                    const nextMetal = event.target.value
                                    updateLine(line.key, {
                                      metal: nextMetal,
                                      purity: isSilver(nextMetal) ? SILVER_PURITIES[0] : '22K',
                                    })
                                  }}
                                >
                                  {STOCK_METALS.map((metalName) => (
                                    <option key={metalName} value={metalName}>
                                      {metalName}
                                    </option>
                                  ))}
                                </select>
                              </Control>
                            )}
                          </Field>
                        )}

                        <Field label="Category">
                          {line.kind === 'product' || readOnly ? (
                            <Control icon={<FolderKanban size={14} strokeWidth={1.75} />}>
                              <StaticValue>{categoryValue || '—'}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<FolderKanban size={14} strokeWidth={1.75} />}>
                              <select
                                className="select"
                                aria-label="Category"
                                value={line.category}
                                onChange={(event) =>
                                  updateLine(line.key, { category: event.target.value })
                                }
                              >
                                {categoryOptions.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </Control>
                          )}
                        </Field>

                        <Field label="Purity">
                          {readOnly ? (
                            <Control icon={<Shield size={14} strokeWidth={1.75} />}>
                              <StaticValue>{line.purity || '—'}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Shield size={14} strokeWidth={1.75} />}>
                              <select
                                className="select"
                                aria-label="Purity"
                                value={line.purity}
                                onChange={(event) =>
                                  updateLine(line.key, { purity: event.target.value })
                                }
                              >
                                {purities.map((purity) => (
                                  <option key={purity} value={purity}>
                                    {purity}
                                  </option>
                                ))}
                              </select>
                            </Control>
                          )}
                        </Field>
                      </div>

                      <div className="product-form-grid-4">
                        <Field label="Qty">
                          {readOnly ? (
                            <Control icon={<Package size={14} strokeWidth={1.75} />} unit="pcs">
                              <StaticValue>{qty}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Package size={14} strokeWidth={1.75} />} unit="pcs">
                              <input
                                className="input"
                                aria-label="Qty"
                                type="number"
                                min={1}
                                value={line.qty}
                                onChange={(event) => {
                                  const qty = parseNumericField(event.target.value)
                                  const n = Math.max(1, Math.trunc(numericFieldToNumber(qty, 1)))
                                  updateLine(line.key, {
                                    qty,
                                    huids:
                                      line.kind === 'product'
                                        ? resizeHuidRows(line.huids, n)
                                        : [],
                                  })
                                }}
                              />
                            </Control>
                          )}
                        </Field>
                        <Field label="Gross weight">
                          {readOnly ? (
                            <Control icon={<Weight size={14} strokeWidth={1.75} />}>
                              <StaticValue>{formatWeight(grossWeight || netWeight)}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Weight size={14} strokeWidth={1.75} />} unit="g">
                              <input
                                className="input"
                                aria-label="Gross weight"
                                type="number"
                                step="0.001"
                                min={0}
                                placeholder="e.g. 8.50"
                                value={line.grossWeight}
                                onChange={(event) =>
                                  updateLine(line.key, {
                                    grossWeight: parseNumericField(event.target.value),
                                  })
                                }
                              />
                            </Control>
                          )}
                        </Field>
                        <Field label="Net weight">
                          {readOnly ? (
                            <Control icon={<Weight size={14} strokeWidth={1.75} />}>
                              <StaticValue>{formatWeight(netWeight)}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Weight size={14} strokeWidth={1.75} />} unit="g">
                              <input
                                className="input"
                                aria-label="Net weight"
                                type="number"
                                step="0.001"
                                min={0}
                                placeholder="e.g. 8.00"
                                value={line.netWeight}
                                onChange={(event) =>
                                  updateLine(line.key, {
                                    netWeight: parseNumericField(event.target.value),
                                  })
                                }
                              />
                            </Control>
                          )}
                        </Field>
                        <Field label="Rate">
                          {readOnly ? (
                            <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                              <StaticValue>{formatCurrency(rate)}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Coins size={14} strokeWidth={1.75} />} unit="₹">
                              <input
                                className="input"
                                aria-label="Rate"
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="e.g. 5800"
                                value={line.rate}
                                onChange={(event) =>
                                  updateLine(line.key, { rate: parseNumericField(event.target.value) })
                                }
                              />
                            </Control>
                          )}
                        </Field>
                      </div>

                      <div className="product-form-grid-2">
                        <Field label="Making">
                          {readOnly ? (
                            <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                              <StaticValue>{formatCurrency(makingCharges)}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Coins size={14} strokeWidth={1.75} />} unit="₹">
                              <input
                                className="input"
                                aria-label="Making"
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="e.g. 250"
                                value={line.makingCharges}
                                onChange={(event) =>
                                  updateLine(line.key, {
                                    makingCharges: parseNumericField(event.target.value),
                                  })
                                }
                              />
                            </Control>
                          )}
                        </Field>
                        <Field label="HSN">
                          {readOnly ? (
                            <Control icon={<Hash size={14} strokeWidth={1.75} />}>
                              <StaticValue>{line.hsnCode || DEFAULT_HSN}</StaticValue>
                            </Control>
                          ) : (
                            <Control icon={<Hash size={14} strokeWidth={1.75} />}>
                              <input
                                className="input"
                                aria-label="HSN"
                                value={line.hsnCode}
                                onChange={(event) =>
                                  updateLine(line.key, { hsnCode: event.target.value })
                                }
                              />
                            </Control>
                          )}
                        </Field>
                      </div>

                      {line.kind === 'product' ? (
                        <div>
                          <p className="muted">
                            HUID (Hallmark Unique ID) — {line.huids.filter((value) => value.trim()).length} of{' '}
                            {qty} pieces
                            {readOnly
                              ? ''
                              : isHuidMandatory(metal)
                                ? ' · can be added later, needed before finalize'
                                : ' · optional for silver'}
                          </p>
                          <HuidEntryList
                            values={line.huids}
                            disabled={readOnly}
                            onChange={(huids) => updateLine(line.key, { huids })}
                          />
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>

              <div className="purchase-totals">
                <p className="inward-line-totals">Total weight {formatWeight(displayTotals.weight)}</p>
                <div className="purchase-totals-box">
                  <div className="purchase-totals-row">
                    <span>Taxable</span>
                    <span>{formatCurrency(displayTotals.subtotal)}</span>
                  </div>
                  <div className="purchase-totals-row">
                    <span>CGST 1.5%</span>
                    <span>{formatCurrency(displayTotals.cgst)}</span>
                  </div>
                  <div className="purchase-totals-row">
                    <span>SGST 1.5%</span>
                    <span>{formatCurrency(displayTotals.sgst)}</span>
                  </div>
                  <div className="purchase-totals-row">
                    <span>Round off</span>
                    {readOnly ? (
                      <span>{formatCurrency(displayTotals.roundOff)}</span>
                    ) : (
                      <input
                        className="input"
                        aria-label="Round off"
                        type="number"
                        step="0.01"
                        value={roundOffTouched ? roundOff : displayTotals.roundOff}
                        onChange={(event) => {
                          setRoundOffTouched(true)
                          setRoundOff(parseNumericField(event.target.value))
                        }}
                      />
                    )}
                  </div>
                  <div className="purchase-totals-row grand">
                    <span>Grand total</span>
                    <span>{formatCurrency(displayTotals.total)}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <footer className="product-form-footer">
            <p className="product-form-tip">
              <Lightbulb size={14} strokeWidth={1.75} aria-hidden />
              Finalize adds piece stock on products and purchase weight on Gold & Silver.
            </p>
            <div className="product-form-footer-actions">
              <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              {inwardId != null ? (
                <button
                  type="button"
                  className="btn secondary"
                  disabled={saving}
                  onClick={() => setPrintOpen(true)}
                >
                  <Printer size={15} strokeWidth={1.75} aria-hidden />
                  Print
                </button>
              ) : null}
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
                    <Save size={15} strokeWidth={2} aria-hidden />
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
          title="Finalize purchase?"
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
            Finalizing adds piece stock on products and purchase weight on Gold & Silver. This cannot be edited
            afterwards.
          </p>
        </Modal>
      ) : null}

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

      {printOpen && inwardId != null ? (
        <PrintPreviewModal
          title="Print preview"
          path={printPreviewPaths.purchase(inwardId)}
          pdfFilename="purchase.pdf"
          onClose={() => setPrintOpen(false)}
        />
      ) : null}
    </>
  )
}
