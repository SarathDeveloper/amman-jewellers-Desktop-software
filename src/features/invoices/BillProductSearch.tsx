import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Search } from 'lucide-react'
import type { Product, ProductInput } from '@shared/types'
import { api } from '../../lib/api'
import { formatWeight } from '../../lib/format'
import { useAnchoredPanel } from '../../lib/useAnchoredPanel'
import { ProductFormModal } from '../products/ProductFormModal'
import { sellableProducts, variantDisplayName } from '../products/productDisplay'
import { stockAvailabilityLabel } from './invoiceEditorHelpers'

type BillProductSearchProps = {
  products: Product[]
  disabled?: boolean
  label?: string
  hideLabel?: boolean
  hideAddButton?: boolean
  compact?: boolean
  placeholder?: string
  /** Pieces of each product already on the bill, so they cannot be over-picked. */
  usedQtyByProduct?: Record<number, number>
  onSelect: (product: Product, huid?: string) => void
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
  usedQtyByProduct = {},
  onSelect,
  onProductCreated,
  onError,
}: BillProductSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalName, setModalName] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelStyle = useAnchoredPanel(rootRef, open)

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
        ...(product.huids ?? []),
      ].some((value) => value.toLowerCase().includes(q)),
    )
  }, [sellable, query])

  /** When the search text is exactly a HUID, picking the product claims that piece. */
  function matchedHuid(product: Product): string | undefined {
    const q = query.trim().toUpperCase()
    if (!q) return undefined
    return (product.huids ?? []).find((huid) => huid.toUpperCase() === q)
  }

  const showNoMatch = query.trim().length > 0 && filtered.length === 0

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
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
    onSelect(product, matchedHuid(product))
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
      {open && !disabled
        ? createPortal(
            <div ref={panelRef} className="billing-customer-dropdown" role="listbox" style={panelStyle}>
              {filtered.map((product) => {
                const used = usedQtyByProduct[product.id] ?? 0
                const meta = [product.metal, product.purity, product.size, formatWeight(product.netWeight)]
                  .filter(Boolean)
                  .join(' · ')
                const availability = stockAvailabilityLabel(product.stockQty, used)
                const unavailable = used >= product.stockQty
                return (
                  <button
                    key={product.id}
                    type="button"
                    className={`billing-customer-option${unavailable ? ' billing-customer-option--unavailable' : ''}`}
                    role="option"
                    aria-disabled={unavailable}
                    title={availability}
                    disabled={unavailable}
                    onClick={() => pick(product)}
                  >
                    <span className="billing-customer-option-name" title={variantDisplayName(product)}>
                      {variantDisplayName(product)}
                    </span>
                    <span className="billing-customer-option-meta" title={meta}>
                      {meta}
                      {meta ? ' · ' : ''}
                      <span className="billing-customer-option-stock">{availability}</span>
                    </span>
                  </button>
                )
              })}
              {showNoMatch ? (
                <button
                  type="button"
                  className="billing-customer-option billing-customer-no-match"
                  onClick={openAddModal}
                >
                  No product found — Add new
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

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
