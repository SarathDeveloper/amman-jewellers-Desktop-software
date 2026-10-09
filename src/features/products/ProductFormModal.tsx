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
import { isHuidMandatory } from '@shared/itemTypes'
import type { Product, ProductInput } from '@shared/types'
import { Modal } from '../../components/Modal'
import { localImageSrc } from '../invoices/mapShopDisplay'
import { api } from '../../lib/api'
import { numericFieldToNumber, parseNumericField } from '../../lib/numericField'
import { HuidEntryList, resizeHuidRows } from './HuidEntryList'
import { ProductThumb } from './productDisplay'
import {
  categoryOptions,
  formToProductInput,
  metalOptions,
  newAttributeRow,
  productToForm,
  purityOptions,
  resolvePurityForMetal,
  validateProductForm,
  type ProductFormErrors,
  type ProductFormState,
} from './productForm'

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
}: {
  value: ProductFormState['grossWeight']
  onChange: (value: ProductFormState['grossWeight']) => void
  step: string
  invalid?: boolean
  unit: string
  icon?: ReactNode
  placeholder?: string
}) {
  return (
    <Control icon={icon} unit={unit}>
      <input
        className={`input${invalid ? ' is-invalid' : ''}`}
        type="number"
        step={step}
        min={0}
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

export function ProductFormModal({
  product,
  products,
  parentProduct = null,
  initialName,
  onClose,
  onSave,
}: {
  product: Product | null
  products: Product[]
  parentProduct?: Product | null
  initialName?: string
  onClose: () => void
  onSave: (input: ProductInput) => Promise<void>
}) {
  const isEdit = Boolean(product)
  const isVariant = Boolean(parentProduct) || Boolean(product?.parentId)
  const lockedParent = parentProduct ?? products.find((row) => row.id === product?.parentId) ?? null
  const [form, setForm] = useState<ProductFormState>(() => {
    const base = productToForm(product, parentProduct)
    if (!product && !parentProduct && initialName?.trim()) {
      return { ...base, name: initialName.trim() }
    }
    return base
  })
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const metals = useMemo(() => metalOptions(form.metal), [form.metal])
  const categories = useMemo(
    () => categoryOptions(categoryNames, form.category),
    [categoryNames, form.category],
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
      if (
        nextHuids.length === current.huids.length &&
        nextHuids.every((value, index) => value === current.huids[index])
      ) {
        return current
      }
      return { ...current, huids: nextHuids }
    })
  }, [form.stockQty])

  const previewName = form.name.trim() || 'Untitled product'
  const formTitle = isEdit
    ? isVariant
      ? 'Edit variant'
      : 'Edit product'
    : isVariant
      ? 'Add variant'
      : 'Add product'
  const formSubtitle = isEdit
    ? isVariant
      ? 'Update this weight, size, and stone variant'
      : 'Update this jewellery item in your inventory'
    : isVariant
      ? `Add a sellable variant of ${lockedParent?.name ?? 'this design'}`
      : 'Create a jewellery item and define its pricing, stock and variants'

  function updateField<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setFormError(null)
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
    const nextErrors = validateProductForm(form, products, product?.id ?? null, categoryNames)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    try {
      setSaving(true)
      setFormError(null)
      await onSave(formToProductInput(form))
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
              <div className="product-form-image-block">
                <span className="product-form-image-label">Product image</span>
                <div className="product-image-uploader">
                  {form.imagePath ? (
                    <div className="product-image-thumb">
                      <img src={localImageSrc(form.imagePath, '')} alt="" />
                      <button
                        type="button"
                        className="btn ghost icon-btn product-image-remove"
                        aria-label="Remove image"
                        onClick={() => updateField('imagePath', '')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="product-image-thumb" aria-hidden>
                      <ProductThumb metal={form.metal} name={previewName} />
                    </div>
                  )}
                  <label className="product-image-drop">
                    <Upload size={18} strokeWidth={1.75} aria-hidden />
                    <strong>{form.imagePath ? 'Change image' : 'Upload image'}</strong>
                    <span>PNG, JPEG (max 2MB)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void pickImage(file)
                        event.target.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>
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
                error={errors.category}
                hint={
                  categoryNames.length === 0
                    ? 'Manage categories in Stock first, then add products.'
                    : undefined
                }
              >
                <Control icon={<FolderKanban size={14} strokeWidth={1.75} />}>
                  <select
                    className={`select${errors.category ? ' is-invalid' : ''}`}
                    value={form.category}
                    disabled={isVariant}
                    onChange={(event) => updateField('category', event.target.value)}
                  >
                    {categories.length === 0 ? <option value="">Select category</option> : null}
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
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
              title="Stock & variant"
              subtitle="Quantity, size, and extra details"
            />
            <div className="product-form-grid-3">
              <Field label="Stock quantity" required>
                <UnitField
                  value={form.stockQty}
                  onChange={(value) => updateField('stockQty', value)}
                  step="1"
                  unit="pcs"
                  placeholder="e.g. 3"
                  icon={<Package size={14} strokeWidth={1.75} />}
                />
              </Field>
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
            <div className="product-attr-editor">
              <div className="product-attr-head">
                <span>HUID (Hallmark Unique ID)</span>
              </div>
              <p className="muted">
                {taggedHuidCount} of {stockQty} pieces tagged
                {isHuidMandatory(form.metal) ? '' : ' · optional for silver'}
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
