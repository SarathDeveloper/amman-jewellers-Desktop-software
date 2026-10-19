import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Coins,
  FolderKanban,
  Gem,
  Hash,
  Lightbulb,
  Package,
  Plus,
  Ruler,
  Save,
  Scale,
  Shield,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Weight,
  X,
} from 'lucide-react'
import type { Product, ProductInput } from '@shared/types'
import { Modal } from '../../components/Modal'
import { localImageSrc } from '../invoices/mapShopDisplay'
import { api } from '../../lib/api'
import { numericFieldToNumber, parseNumericField } from '../../lib/numericField'
import { HuidEntryList, resizeHuidRows } from './HuidEntryList'
import { ProductThumb } from './productDisplay'
import {
  categoryOptions,
  existingPiecesToUpdateInput,
  inventoryPieceToEditRow,
  metalOptions,
  newAttributeRow,
  newOpeningPiece,
  productInputForSource,
  productToForm,
  purityOptions,
  resizeOpeningPieces,
  resolvePurityForMetal,
  syncFollowingPieces,
  validateExistingPieceEdits,
  validateProductForm,
  type ExistingPieceEditRow,
  type OpeningPieceRow,
  type ProductFormErrors,
  type ProductFormState,
} from './productForm'

/** Sentinel value for the Category select "Other" option (not a real category name). */
const OTHER_CATEGORY = '__other__'

function RequiredMark() {
  return (
    <span className="settings-required" aria-hidden>
      *
    </span>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <span className="product-form-error">{message}</span>
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="product-form-field">
      <label>
        <span className="product-form-label-text">
          {label}
          {required ? (
            <>
              {' '}
              <RequiredMark />
            </>
          ) : null}
        </span>
        {children}
      </label>
      {hint ? <span className="cell-hint">{hint}</span> : null}
      <FieldError message={error} />
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

function UnitField({
  value,
  onChange,
  step,
  invalid,
  unit,
  icon,
  placeholder,
  disabled,
}: {
  value: ProductFormState['grossWeight']
  onChange: (value: ProductFormState['grossWeight']) => void
  step: string
  invalid?: boolean
  unit: string
  icon?: ReactNode
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <Control icon={icon} unit={unit}>
      <input
        className={`input${invalid ? ' is-invalid' : ''}`}
        type="number"
        step={step}
        min={0}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(parseNumericField(event.target.value))}
      />
    </Control>
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

function ImageField({
  imagePath,
  metal,
  previewName,
  onPick,
  onRemove,
}: {
  imagePath: string
  metal: string
  previewName: string
  onPick: (file: File) => void
  onRemove: () => void
}) {
  return (
    <div className="product-form-image-block">
      <span className="product-form-image-label">Product image</span>
      <div className="product-image-uploader">
        {imagePath ? (
          <div className="product-image-thumb">
            <img src={localImageSrc(imagePath, '')} alt="" />
            <button
              type="button"
              className="btn ghost icon-btn product-image-remove"
              aria-label="Remove image"
              onClick={onRemove}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="product-image-thumb" aria-hidden>
            <ProductThumb metal={metal} name={previewName} />
          </div>
        )}
        <label className="product-image-drop">
          <Upload size={18} strokeWidth={1.75} aria-hidden />
          <strong>{imagePath ? 'Change image' : 'Upload image'}</strong>
          <span>PNG, JPEG (max 2MB)</span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onPick(file)
              event.target.value = ''
            }}
          />
        </label>
      </div>
    </div>
  )
}

export function ProductFormModal({
  product,
  products,
  initialName,
  initialValues,
  source = 'products',
  onClose,
  onSave,
}: {
  product: Product | null
  products: Product[]
  initialName?: string
  /** Pre-fills fields that were already typed on the purchase line. */
  initialValues?: Partial<ProductFormState>
  /**
   * Where the form was opened from. A product created inside a purchase must
   * start with no stock: the purchase line itself is what adds the pieces when
   * it is finalized, so entering a stock quantity here would count them twice.
   */
  source?: 'products' | 'purchase'
  onClose: () => void
  onSave: (input: ProductInput) => Promise<void>
}) {
  const isPurchase = source === 'purchase'
  const isEdit = Boolean(product)
  const isVariant = Boolean(product?.parentId)
  const [form, setForm] = useState<ProductFormState>(() => {
    const base = productToForm(product)
    const named = !product && initialName?.trim() ? { ...base, name: initialName.trim() } : base
    return initialValues ? { ...named, ...initialValues } : named
  })
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const [useOtherCategory, setUseOtherCategory] = useState(false)
  const [existingPieces, setExistingPieces] = useState<ExistingPieceEditRow[]>([])
  const [existingPiecesLoading, setExistingPiecesLoading] = useState(false)
  const metals = useMemo(() => metalOptions(form.metal), [form.metal])
  const categories = useMemo(
    () => categoryOptions(categoryNames, useOtherCategory ? '' : form.category),
    [categoryNames, form.category, useOtherCategory],
  )

  useEffect(() => {
    let active = true
    void api
      .listProductCategories()
      .then((rows) => {
        if (active) setCategoryNames(rows.map((row) => row.name))
      })
      .catch(() => {
        if (active) setCategoryNames([])
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!product?.trackPieces) {
      setExistingPieces([])
      setExistingPiecesLoading(false)
      return
    }
    let active = true
    setExistingPiecesLoading(true)
    void api
      .listProductPieces(product.id)
      .then((rows) => {
        if (active) setExistingPieces(rows.map(inventoryPieceToEditRow))
      })
      .catch(() => {
        if (active) setExistingPieces([])
      })
      .finally(() => {
        if (active) setExistingPiecesLoading(false)
      })
    return () => {
      active = false
    }
  }, [product?.id, product?.trackPieces])
  const purities = useMemo(
    () => purityOptions(form.metal, products, form.purity),
    [form.metal, products, form.purity],
  )
  const stockQty = Math.max(0, Math.trunc(numericFieldToNumber(form.stockQty)))
  const taggedHuidCount = form.huids.filter((value) => value.trim()).length

  useEffect(() => {
    setForm((current) => {
      const nextQty = Math.max(0, Math.trunc(numericFieldToNumber(current.stockQty)))
      const nextHuids = resizeHuidRows(current.huids, nextQty, true)
      const template = {
        grossWeight: current.grossWeight,
        stoneWeight: current.stoneWeight,
        netWeight: current.netWeight,
      }
      const nextPieces = current.trackPieces
        ? resizeOpeningPieces(current.openingPieces ?? [], nextQty, template)
        : (current.openingPieces ?? [])
      const huidsSame =
        nextHuids.length === current.huids.length &&
        nextHuids.every((value, index) => value === current.huids[index])
      if (huidsSame && nextPieces === (current.openingPieces ?? [])) return current
      return { ...current, huids: nextHuids, openingPieces: nextPieces }
    })
  }, [form.stockQty, form.trackPieces])

  const previewName = form.name.trim() || 'Untitled product'
  const formTitle = isEdit ? (isVariant ? 'Edit variant' : 'Edit product') : 'Add product'
  const formSubtitle = isEdit
    ? isVariant
      ? 'Update this weight, size, and stone variant'
      : 'Update this jewellery item in your inventory'
    : isPurchase
      ? 'Create the design once. This purchase adds its pieces on finalize'
      : 'Create a jewellery item and define its pricing and stock'

  function updateField<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'grossWeight' || key === 'netWeight' || key === 'stoneWeight') {
        return syncFollowingPieces(next)
      }
      return next
    })
    setErrors((current) => ({ ...current, [key]: undefined, pieces: undefined }))
    setFormError(null)
  }

  function updateOpeningPiece(id: string, patch: Partial<OpeningPieceRow>) {
    setForm((current) => ({
      ...current,
      openingPieces: current.openingPieces.map((piece) => {
        if (piece.id !== id) return piece
        const weightEdit =
          patch.grossWeight !== undefined ||
          patch.stoneWeight !== undefined ||
          patch.netWeight !== undefined
        const next = { ...piece, ...patch, followsDesign: weightEdit ? false : piece.followsDesign }
        const gross = numericFieldToNumber(
          patch.grossWeight !== undefined ? patch.grossWeight : piece.grossWeight,
        )
        const stone = numericFieldToNumber(
          patch.stoneWeight !== undefined ? patch.stoneWeight : piece.stoneWeight,
        )
        if (patch.grossWeight !== undefined || patch.stoneWeight !== undefined) {
          next.netWeight = gross > 0 ? Math.max(0, Math.round((gross - stone) * 1000) / 1000) : piece.netWeight
        }
        return next
      }),
    }))
    setErrors((current) => ({ ...current, pieces: undefined }))
    setFormError(null)
  }

  function updateExistingPiece(id: number, patch: Partial<ExistingPieceEditRow>) {
    setExistingPieces((current) =>
      current.map((piece) => {
        if (piece.id !== id || !piece.editable) return piece
        const next = { ...piece, ...patch }
        const gross = numericFieldToNumber(
          patch.grossWeight !== undefined ? patch.grossWeight : piece.grossWeight,
        )
        const stone = numericFieldToNumber(
          patch.stoneWeight !== undefined ? patch.stoneWeight : piece.stoneWeight,
        )
        if (patch.grossWeight !== undefined || patch.stoneWeight !== undefined) {
          next.netWeight =
            gross > 0 ? Math.max(0, Math.round((gross - stone) * 1000) / 1000) : piece.netWeight
        }
        return next
      }),
    )
    setErrors((current) => ({ ...current, pieces: undefined }))
    setFormError(null)
  }

  function addOpeningPiece() {
    setForm((current) => {
      const openingPieces = [
        ...current.openingPieces,
        newOpeningPiece({
          grossWeight: current.grossWeight,
          stoneWeight: current.stoneWeight,
          netWeight: current.netWeight,
        }),
      ]
      return { ...current, openingPieces, stockQty: openingPieces.length }
    })
    setErrors((current) => ({ ...current, pieces: undefined }))
  }

  function removeOpeningPiece(id: string) {
    setForm((current) => {
      const openingPieces = current.openingPieces.filter((piece) => piece.id !== id)
      return { ...current, openingPieces, stockQty: openingPieces.length }
    })
    setErrors((current) => ({ ...current, pieces: undefined }))
  }

  function updateAttribute(index: number, patch: Partial<ProductFormState['attributes'][number]>) {
    setForm((current) => ({
      ...current,
      attributes: current.attributes.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }))
    setFormError(null)
  }

  function addAttribute() {
    setForm((current) => ({
      ...current,
      attributes: [...current.attributes, newAttributeRow()],
    }))
  }

  function removeAttribute(index: number) {
    setForm((current) => ({
      ...current,
      attributes: current.attributes.filter((_, rowIndex) => rowIndex !== index),
    }))
  }

  function updateMetal(next: string) {
    setForm((current) => {
      return {
        ...current,
        metal: next,
        purity: resolvePurityForMetal(next, current.purity, products),
      }
    })
    setErrors((current) => ({ ...current, metal: undefined, purity: undefined }))
    setFormError(null)
  }

  async function pickImage(file: File) {
    try {
      const { path } = await api.uploadShopImage(file)
      updateField('imagePath', path)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to choose image')
    }
  }

  async function handleSave() {
    // A purchase-created product owns no stock yet; the purchase line adds the
    // pieces on finalize. Validate and save with that empty stock.
    const effectiveForm: ProductFormState = isPurchase
      ? { ...form, stockQty: 0, huids: [], trackPieces: true, openingPieces: [] }
      : form
    const nextErrors = validateProductForm(
      effectiveForm,
      products,
      product?.id ?? null,
      categoryNames,
      useOtherCategory,
    )
    if (product?.trackPieces) {
      const pieceError = validateExistingPieceEdits(existingPieces)
      if (pieceError) nextErrors.pieces = pieceError
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    try {
      setSaving(true)
      setFormError(null)
      let categoryName = form.category.trim()
      if (useOtherCategory) {
        const existing = categoryNames.find(
          (name) => name.toLowerCase() === categoryName.toLowerCase(),
        )
        if (existing) {
          categoryName = existing
        } else {
          try {
            await api.createStockCategory({ name: categoryName })
            setCategoryNames((prev) =>
              prev.some((name) => name.toLowerCase() === categoryName.toLowerCase())
                ? prev
                : [...prev, categoryName],
            )
          } catch (err) {
            const message = err instanceof Error ? err.message : ''
            if (!/already exists/i.test(message)) throw err
          }
        }
      }
      if (product?.trackPieces) {
        const pieceUpdates = existingPiecesToUpdateInput(existingPieces)
        if (pieceUpdates.length > 0) {
          const saved = await api.updateProductPieces(product.id, pieceUpdates)
          setExistingPieces(saved.map(inventoryPieceToEditRow))
        }
      }
      await onSave(
        productInputForSource(
          { ...form, category: categoryName },
          isPurchase ? 'purchase' : 'products',
        ),
      )
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      className="modal-wide product-form-modal"
      title={formTitle}
      hideTitle
      footer={null}
      onClose={onClose}
    >
      <div className="product-form-shell">
        <header className="product-form-header">
          <div className="product-form-header-copy">
            <span className="product-form-header-icon" aria-hidden>
              <Gem size={18} strokeWidth={1.75} />
            </span>
            <div>
              <h2>{formTitle}</h2>
              <p>{formSubtitle}</p>
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
          {formError ? <div className="error-banner product-form-banner">{formError}</div> : null}

          <section className="product-section">
            <SectionHead
              step={1}
              title="Product information"
              subtitle="Name, code, and image"
            />
            <div className="product-form-identity">
              <div className="product-form-identity-fields">
                <Field label="Product name" required error={errors.name}>
                  <Control icon={<Tag size={14} strokeWidth={1.75} />}>
                    <input
                      className={`input${errors.name ? ' is-invalid' : ''}`}
                      value={form.name}
                      autoFocus
                      placeholder={
                        isVariant ? 'e.g. Gold Ring' : 'e.g. Gold Chain, Ring, Bracelet...'
                      }
                      onChange={(event) => updateField('name', event.target.value)}
                    />
                  </Control>
                </Field>
                <Field label="SKU / Variant code" hint="Optional unique code for this piece">
                  <Control icon={<Hash size={14} strokeWidth={1.75} />}>
                    <input
                      className="input"
                      value={form.variantCode}
                      placeholder="e.g. GR-2.5-16"
                      onChange={(event) => updateField('variantCode', event.target.value)}
                    />
                  </Control>
                </Field>
              </div>
              {isPurchase ? null : (
                <ImageField
                  imagePath={form.imagePath}
                  metal={form.metal}
                  previewName={previewName}
                  onPick={pickImage}
                  onRemove={() => updateField('imagePath', '')}
                />
              )}
            </div>
          </section>

          <section className="product-section">
            <SectionHead
              step={2}
              title="Classification"
              subtitle="Metal, category, and purity"
            />
            <div className="product-form-grid-3">
              <Field label="Metal" required error={errors.metal}>
                <Control icon={<Coins size={14} strokeWidth={1.75} />}>
                  <select
                    className={`select${errors.metal ? ' is-invalid' : ''}`}
                    value={form.metal}
                    disabled={isVariant}
                    onChange={(event) => updateMetal(event.target.value)}
                  >
                    {metals.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Control>
              </Field>
              <Field
                label="Category"
                required
                error={useOtherCategory ? undefined : errors.category}
              >
                <Control icon={<FolderKanban size={14} strokeWidth={1.75} />}>
                  <select
                    className={`select${errors.category && !useOtherCategory ? ' is-invalid' : ''}`}
                    value={useOtherCategory ? OTHER_CATEGORY : form.category}
                    disabled={isVariant}
                    onChange={(event) => {
                      const value = event.target.value
                      if (value === OTHER_CATEGORY) {
                        setUseOtherCategory(true)
                        updateField('category', '')
                        return
                      }
                      setUseOtherCategory(false)
                      updateField('category', value)
                    }}
                  >
                    {categories.length === 0 && !useOtherCategory ? (
                      <option value="">Select category</option>
                    ) : null}
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                    {isVariant ? null : <option value={OTHER_CATEGORY}>Other</option>}
                  </select>
                </Control>
              </Field>
              <Field label="Purity" required error={errors.purity}>
                <Control icon={<Shield size={14} strokeWidth={1.75} />}>
                  <select
                    className={`select${errors.purity ? ' is-invalid' : ''}`}
                    value={form.purity}
                    onChange={(event) => updateField('purity', event.target.value)}
                  >
                    {purities.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Control>
              </Field>
            </div>
            {useOtherCategory && !isVariant ? (
              <div className="product-form-grid-3">
                <Field label="New category" required error={errors.category}>
                  <Control icon={<FolderKanban size={14} strokeWidth={1.75} />}>
                    <input
                      className={`input${errors.category ? ' is-invalid' : ''}`}
                      value={form.category}
                      placeholder="e.g. Bracelet, Pendant..."
                      maxLength={80}
                      autoFocus
                      onChange={(event) => updateField('category', event.target.value)}
                    />
                  </Control>
                </Field>
              </div>
            ) : null}
          </section>

          <section className="product-section">
            <SectionHead
              step={3}
              title="Weight & pricing"
              subtitle="Weights and making charges"
            />
            <div className="product-form-grid-4">
              <Field label="Gross weight" required>
                <UnitField
                  value={form.grossWeight}
                  onChange={(value) => updateField('grossWeight', value)}
                  step="0.001"
                  unit="g"
                  placeholder="e.g. 2.70"
                  icon={<Scale size={14} strokeWidth={1.75} />}
                />
              </Field>
              <Field label="Net weight" required error={errors.netWeight}>
                <UnitField
                  value={form.netWeight}
                  onChange={(value) => {
                    updateField('netWeight', value)
                    setErrors((current) => ({ ...current, netWeight: undefined }))
                  }}
                  step="0.001"
                  invalid={Boolean(errors.netWeight)}
                  unit="g"
                  placeholder="e.g. 2.50"
                  icon={<Weight size={14} strokeWidth={1.75} />}
                />
              </Field>
              <Field label="Stone weight" error={errors.stoneWeight}>
                <UnitField
                  value={form.stoneWeight}
                  onChange={(value) => {
                    updateField('stoneWeight', value)
                    setErrors((current) => ({ ...current, stoneWeight: undefined }))
                  }}
                  step="0.001"
                  invalid={Boolean(errors.stoneWeight)}
                  unit="g"
                  placeholder="e.g. 0.20"
                  icon={<Sparkles size={14} strokeWidth={1.75} />}
                />
              </Field>
              <Field label="Making charges">
                <UnitField
                  value={form.makingCharges}
                  onChange={(value) => updateField('makingCharges', value)}
                  step="0.01"
                  unit="₹"
                  placeholder="e.g. 400"
                  icon={<Coins size={14} strokeWidth={1.75} />}
                />
              </Field>
            </div>
          </section>

          <section className="product-section">
            <SectionHead
              step={4}
              title={isPurchase ? 'More details' : 'Stock & variant'}
              subtitle={
                isPurchase
                  ? 'Optional size, stone details, image and attributes'
                  : 'Quantity, size, and extra details'
              }
            />
            <div className="product-form-grid-3">
              {isPurchase ? null : (
                <Field
                  label="Stock quantity"
                  required
                  hint={
                    product?.trackPieces
                      ? 'Counted from pieces. Change stock with Add stock (purchase) or by selling.'
                      : form.trackPieces
                        ? 'One row below for each piece.'
                        : undefined
                  }
                >
                  <UnitField
                    value={form.stockQty}
                    onChange={(value) => updateField('stockQty', value)}
                    step="1"
                    unit="pcs"
                    placeholder="e.g. 3"
                    disabled={product?.trackPieces === true}
                    icon={<Package size={14} strokeWidth={1.75} />}
                  />
                </Field>
              )}
              <Field label="Size">
                <Control icon={<Ruler size={14} strokeWidth={1.75} />}>
                  <input
                    className="input"
                    value={form.size}
                    placeholder="e.g. 16"
                    onChange={(event) => updateField('size', event.target.value)}
                  />
                </Control>
              </Field>
              <Field label="Stone details" hint="Optional stone type, colour, or setting">
                <Control icon={<Sparkles size={14} strokeWidth={1.75} />}>
                  <input
                    className="input"
                    value={form.stoneDetails}
                    placeholder="e.g. 2 ruby stones, prong set"
                    onChange={(event) => updateField('stoneDetails', event.target.value)}
                  />
                </Control>
              </Field>
            </div>
            {isPurchase ? (
              <ImageField
                imagePath={form.imagePath}
                metal={form.metal}
                previewName={previewName}
                onPick={pickImage}
                onRemove={() => updateField('imagePath', '')}
              />
            ) : null}
            {isPurchase ? (
              <p className="muted">
                Stock, pieces and HUIDs are added when this purchase is finalized, so they are not
                entered here.
              </p>
            ) : form.trackPieces && product?.trackPieces ? (
              <div className="inward-pieces opening-pieces existing-pieces">
                <div className="inward-pieces-head">
                  <strong>Pieces ({existingPieces.length})</strong>
                </div>
                <p className="muted">
                  Edit HUID, weights and cost for in-stock pieces. Add or remove pieces with Adjust
                  stock or a purchase.
                </p>
                {errors.pieces ? <span className="product-form-error">{errors.pieces}</span> : null}
                {existingPiecesLoading ? (
                  <p className="muted">Loading pieces…</p>
                ) : existingPieces.length === 0 ? (
                  <p className="muted">No pieces yet. Add stock from a purchase.</p>
                ) : (
                  <div className="inward-pieces-wrap">
                    <table className="inward-pieces-table">
                      <thead>
                        <tr>
                          <th>Tag</th>
                          <th>HUID</th>
                          <th>Gross</th>
                          <th>Stone</th>
                          <th>Net</th>
                          <th>Cost</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {existingPieces.map((piece) => {
                          const editable = piece.editable
                          return (
                            <tr key={piece.id}>
                              <td className="num">{piece.tagCode}</td>
                              <td>
                                {editable ? (
                                  <input
                                    className="input"
                                    aria-label={`${piece.tagCode} HUID`}
                                    placeholder="Optional"
                                    value={piece.huid}
                                    onChange={(event) =>
                                      updateExistingPiece(piece.id, {
                                        huid: event.target.value
                                          .toUpperCase()
                                          .replace(/[^0-9A-Z]/g, ''),
                                      })
                                    }
                                  />
                                ) : (
                                  piece.huid || '—'
                                )}
                              </td>
                              <td>
                                {editable ? (
                                  <input
                                    className="input"
                                    type="number"
                                    step="0.001"
                                    min={0}
                                    aria-label={`${piece.tagCode} gross weight`}
                                    value={piece.grossWeight}
                                    onChange={(event) =>
                                      updateExistingPiece(piece.id, {
                                        grossWeight: parseNumericField(event.target.value),
                                      })
                                    }
                                  />
                                ) : (
                                  piece.grossWeight
                                )}
                              </td>
                              <td>
                                {editable ? (
                                  <input
                                    className="input"
                                    type="number"
                                    step="0.001"
                                    min={0}
                                    aria-label={`${piece.tagCode} stone weight`}
                                    value={piece.stoneWeight}
                                    onChange={(event) =>
                                      updateExistingPiece(piece.id, {
                                        stoneWeight: parseNumericField(event.target.value),
                                      })
                                    }
                                  />
                                ) : (
                                  piece.stoneWeight
                                )}
                              </td>
                              <td>
                                {editable ? (
                                  <input
                                    className="input"
                                    type="number"
                                    step="0.001"
                                    min={0}
                                    aria-label={`${piece.tagCode} net weight`}
                                    value={piece.netWeight}
                                    onChange={(event) =>
                                      updateExistingPiece(piece.id, {
                                        netWeight: parseNumericField(event.target.value),
                                      })
                                    }
                                  />
                                ) : (
                                  piece.netWeight
                                )}
                              </td>
                              <td>
                                {editable ? (
                                  <input
                                    className="input"
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    aria-label={`${piece.tagCode} cost`}
                                    value={piece.cost}
                                    placeholder="—"
                                    onChange={(event) =>
                                      updateExistingPiece(piece.id, {
                                        cost: parseNumericField(event.target.value),
                                      })
                                    }
                                  />
                                ) : piece.cost === '' ? (
                                  '—'
                                ) : (
                                  piece.cost
                                )}
                              </td>
                              <td className="product-detail-piece-status">{piece.status}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : form.trackPieces ? (
              <div className="inward-pieces opening-pieces">
                <div className="inward-pieces-head">
                  <strong>Pieces ({form.openingPieces.length})</strong>
                  <button type="button" className="btn secondary" onClick={addOpeningPiece}>
                    <Plus size={14} strokeWidth={2} aria-hidden />
                    Add piece
                  </button>
                </div>
                <p className="muted">
                  Enter each ornament. A tag is assigned when you save. HUID is optional.
                </p>
                {errors.pieces ? <span className="product-form-error">{errors.pieces}</span> : null}
                {form.openingPieces.length === 0 ? (
                  <p className="muted">Set a stock quantity to enter each piece.</p>
                ) : (
                  <div className="inward-pieces-wrap">
                    <table className="inward-pieces-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>HUID</th>
                          <th>Gross</th>
                          <th>Stone</th>
                          <th>Net</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {form.openingPieces.map((piece, index) => (
                          <tr key={piece.id}>
                            <td>{index + 1}</td>
                            <td>
                              <input
                                className="input"
                                aria-label={`Piece ${index + 1} HUID`}
                                placeholder="Optional"
                                value={piece.huid}
                                onChange={(event) =>
                                  updateOpeningPiece(piece.id, {
                                    huid: event.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="input"
                                type="number"
                                step="0.001"
                                min={0}
                                aria-label={`Piece ${index + 1} gross weight`}
                                value={piece.grossWeight}
                                onChange={(event) =>
                                  updateOpeningPiece(piece.id, {
                                    grossWeight: parseNumericField(event.target.value),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="input"
                                type="number"
                                step="0.001"
                                min={0}
                                aria-label={`Piece ${index + 1} stone weight`}
                                value={piece.stoneWeight}
                                onChange={(event) =>
                                  updateOpeningPiece(piece.id, {
                                    stoneWeight: parseNumericField(event.target.value),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="input"
                                type="number"
                                step="0.001"
                                min={0}
                                aria-label={`Piece ${index + 1} net weight`}
                                value={piece.netWeight}
                                onChange={(event) =>
                                  updateOpeningPiece(piece.id, {
                                    netWeight: parseNumericField(event.target.value),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn ghost icon-btn"
                                aria-label={`Remove piece ${index + 1}`}
                                onClick={() => removeOpeningPiece(piece.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="product-attr-editor">
                <div className="product-attr-head">
                  <span>HUID (Hallmark Unique ID)</span>
                </div>
                <p className="muted">
                  {taggedHuidCount} of {stockQty} pieces tagged · optional
                </p>
                {stockQty === 0 && taggedHuidCount === 0 ? (
                  <p className="muted">No HUID needed while stock is 0.</p>
                ) : (
                  <HuidEntryList
                    values={form.huids}
                    error={errors.huids}
                    allowRemove={form.huids.length > stockQty}
                    onChange={(huids) => {
                      setForm((current) => ({ ...current, huids }))
                      setErrors((current) => ({ ...current, huids: undefined }))
                      setFormError(null)
                    }}
                  />
                )}
              </div>
            )}
            {isPurchase ? null : (
              <label className="product-form-toggle">
                <input
                  type="checkbox"
                  checked={form.trackPieces}
                  disabled={product?.trackPieces === true}
                  onChange={(event) => updateField('trackPieces', event.target.checked)}
                />
                <span>
                  <strong>Track each piece</strong>
                  <span>
                    {product?.trackPieces
                      ? 'This product already tracks each piece. It cannot be turned off.'
                      : 'Give every ornament its own tag, weight and HUID. On by default.'}
                  </span>
                </span>
              </label>
            )}
            <label className="product-form-toggle">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => updateField('isActive', event.target.checked)}
              />
              <span>
                <strong>Active</strong>
                <span>
                  {form.isActive ? 'Visible in billing and inventory' : 'Hidden from billing'}
                </span>
              </span>
            </label>
            <div className="product-attr-editor">
              <div className="product-attr-head">
                <span>Custom attributes</span>
                <button type="button" className="btn ghost" onClick={addAttribute}>
                  <Plus size={14} strokeWidth={2} aria-hidden />
                  Add
                </button>
              </div>
              {form.attributes.length === 0 ? (
                <p className="muted">Optional keys such as finish, colour, or hallmark.</p>
              ) : (
                form.attributes.map((row, index) => (
                  <div key={row.id} className="product-attr-row">
                    <input
                      className="input"
                      value={row.key}
                      placeholder="Key"
                      aria-label={`Attribute ${index + 1} key`}
                      onChange={(event) => updateAttribute(index, { key: event.target.value })}
                    />
                    <input
                      className="input"
                      value={row.value}
                      placeholder="Value"
                      aria-label={`Attribute ${index + 1} value`}
                      onChange={(event) => updateAttribute(index, { value: event.target.value })}
                    />
                    <button
                      type="button"
                      className="btn ghost icon-btn"
                      aria-label={`Remove attribute ${index + 1}`}
                      onClick={() => removeAttribute(index)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <footer className="product-form-footer">
          <p className="product-form-tip">
            <Lightbulb size={14} strokeWidth={1.75} aria-hidden />
            Fill all essential details to maintain accurate stock and pricing information.
          </p>
          <div className="product-form-footer-actions">
            <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={saving} onClick={() => void handleSave()}>
              <Save size={15} strokeWidth={2} aria-hidden />
              {saving ? 'Saving…' : 'Save product'}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  )
}
