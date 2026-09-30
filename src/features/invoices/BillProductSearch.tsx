import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import type { Product, ProductInput } from '@shared/types'
import { api } from '../../lib/api'
import { formatWeight } from '../../lib/format'
import { ProductFormModal } from '../products/ProductFormModal'
import { sellableProducts, variantDisplayName } from '../products/productDisplay'

type BillProductSearchProps = {
  products: Product[]
  disabled?: boolean
  label?: string
  hideLabel?: boolean
  hideAddButton?: boolean
  compact?: boolean
  placeholder?: string
  onSelect: (product: Product) => void
  onProductCreated: (product: Product) => void
  onError?: (message: string) => void
}

export function BillProductSearch({
  products,
  disabled,
  label = 'Find existing product',
  hideLabel,
  hideAddButton,
  compact,
  placeholder = 'Search product by name, metal or category…',
  onSelect,
  onProductCreated,
  onError,
}: BillProductSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalName, setModalName] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const sellable = useMemo(() => sellableProducts(products), [products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sellable.slice(0, 50)
    return sellable.filter((product) =>
      [
        product.name,
        variantDisplayName(product),
        product.metal,
        product.category,
        product.purity,
        product.variantCode,
        product.size,
        product.stoneDetails,
      ].some((value) => value.toLowerCase().includes(q)),
    )
  }, [sellable, query])

  const showNoMatch = query.trim().length > 0 && filtered.length === 0

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function openAddModal() {
    setModalName(query.trim())
    setModalOpen(true)
    setOpen(false)
  }

  function pick(product: Product) {
    onSelect(product)
    setQuery('')
    setOpen(false)
  }

  async function saveNewProduct(input: ProductInput) {
    try {
      const created = await api.createProduct(input)
      onProductCreated(created)
      setQuery('')
      setModalOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add product'
      onError?.(message)
      throw err
    }
  }

  return (
    <div
      className={`billing-customer-search${compact ? ' billing-product-search--compact' : ' adagu-items-product-search'}`}
      ref={rootRef}
    >
      {hideLabel ? null : <label className="billing-card-label">{label}</label>}
      <div className="billing-customer-input-row">
        <span className="billing-customer-search-icon" aria-hidden>
          <Search size={18} strokeWidth={1.75} />
        </span>
        <input
          className="input billing-customer-input"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
        />
        {hideAddButton ? null : (
          <button
            type="button"
            className="btn secondary billing-customer-add"
            disabled={disabled}
            aria-label="Add new product"
            onClick={openAddModal}
          >
            <Plus size={18} strokeWidth={2} />
          </button>
        )}
      </div>
      {open && !disabled ? (
        <div className="billing-customer-dropdown" role="listbox">
          {filtered.map((product) => (
            <button
              key={product.id}
              type="button"
              className="billing-customer-option"
              role="option"
              onClick={() => pick(product)}
            >
              <span className="billing-customer-option-name">{variantDisplayName(product)}</span>
              <span className="billing-customer-option-meta">
                {[product.metal, product.purity, product.size, formatWeight(product.netWeight)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          ))}
          {showNoMatch ? (
            <button type="button" className="billing-customer-option billing-customer-no-match" onClick={openAddModal}>
              No product found — Add new
            </button>
          ) : null}
        </div>
      ) : null}

      {modalOpen ? (
        <ProductFormModal
          product={null}
          products={products}
          initialName={modalName}
          onClose={() => setModalOpen(false)}
          onSave={saveNewProduct}
        />
      ) : null}
    </div>
  )
}
