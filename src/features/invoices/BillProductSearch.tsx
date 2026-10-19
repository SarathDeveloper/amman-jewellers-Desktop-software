import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react'
import type { InventoryPiece, Product, ProductInput } from '@shared/types'
import { api } from '../../lib/api'
import { formatWeight } from '../../lib/format'
import { useAnchoredPanel } from '../../lib/useAnchoredPanel'
import { ProductFormModal } from '../products/ProductFormModal'
import type { ProductFormState } from '../products/productForm'
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
  /**
   * When set (purchase lines), the selected product name is shown as the input
   * value — same pattern as BillCustomerSearch. Omit on sale so search stays empty.
   */
  selectedProductId?: number | ''
  /**
   * 'sale' (default) hides products with no stock and respects pieces already on
   * the bill. 'purchase' lists every active product, because buying more of an
   * out-of-stock design is the normal case.
   */
  mode?: 'sale' | 'purchase'
  /** Pieces of each product already on the bill, so they cannot be over-picked. */
  usedQtyByProduct?: Record<number, number>
  /** Tracked pieces already claimed by this bill, so they are not offered twice. */
  usedPieceIds?: number[]
  /** Pre-fills the inline product form (purchase entry passes what the line already has). */
  newProductValues?: Partial<ProductFormState>
  onSelect: (product: Product, huid?: string, piece?: InventoryPiece) => void
  /** Clears the line selection when the user starts typing a new search. */
  onClear?: () => void
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
  selectedProductId,
  mode = 'sale',
  usedQtyByProduct = {},
  usedPieceIds = [],
  newProductValues,
  onSelect,
  onClear,
  onProductCreated,
  onError,
}: BillProductSearchProps) {
  const isPurchase = mode === 'purchase'
  const showSelected = selectedProductId !== undefined
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalName, setModalName] = useState('')
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null)
  const [piecesByProduct, setPiecesByProduct] = useState<Record<number, InventoryPiece[]>>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelStyle = useAnchoredPanel(rootRef, open)
  const prevSelectedIdRef = useRef(selectedProductId)

  const selected =
    showSelected && selectedProductId !== '' && selectedProductId != null
      ? products.find((product) => product.id === selectedProductId)
      : undefined

  useEffect(() => {
    if (prevSelectedIdRef.current && !selectedProductId) {
      setQuery('')
    }
    prevSelectedIdRef.current = selectedProductId
  }, [selectedProductId])

  const sellable = useMemo(() => sellableProducts(products), [products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q ? sellable : sellable.slice(0, 50)
    if (!q) return pool
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
        ...(piecesByProduct[product.id] ?? []).flatMap((piece) => [piece.tagCode, piece.huid]),
      ].some((value) => value.toLowerCase().includes(q)),
    )
  }, [sellable, query, piecesByProduct])

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
    setQuery(showSelected ? variantDisplayName(product) : '')
    setOpen(false)
  }

  function pickPiece(product: Product, piece: InventoryPiece) {
    setPiecesByProduct((current) => {
      const next = { ...current }
      delete next[product.id]
      return next
    })
    setExpandedProductId(null)
    onSelect(product, piece.huid || undefined, piece)
    setQuery(showSelected ? variantDisplayName(product) : '')
    setOpen(false)
  }

  async function togglePieces(product: Product) {
    if (expandedProductId === product.id) {
      setExpandedProductId(null)
      return
    }
    setExpandedProductId(product.id)
    if (piecesByProduct[product.id]) return
    try {
      const pieces = await api.listProductPieces(product.id, true)
      setPiecesByProduct((current) => ({ ...current, [product.id]: pieces }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load pieces'
      onError?.(message)
    }
  }

  /**
   * Enter either claims an exact tag / HUID (tracked pieces scan straight in) or
   * picks the only product the search narrowed down to.
   */
  async function handleEnter() {
    const term = query.trim()
    if (!term) return
    try {
      const piece = await api.lookupPiece(term)
      const product = products.find((row) => row.id === piece.productId)
      if (!product) {
        onError?.('This piece belongs to a product that is no longer in the catalog')
        return
      }
      if (piece.status !== 'in_stock') {
        onError?.(`Tag ${piece.tagCode} is ${piece.status}`)
        return
      }
      if (usedPieceIds.includes(piece.id)) {
        onError?.(`Tag ${piece.tagCode} is already on this bill`)
        return
      }
      pickPiece(product, piece)
      return
    } catch {
      // Not a tag or HUID: fall through to a normal product pick.
    }
    if (filtered.length === 1) {
      pick(filtered[0])
    }
  }

  async function saveNewProduct(input: ProductInput) {
    try {
      const created = await api.createProduct(input)
      onProductCreated(created)
      onSelect(created)
      setQuery(showSelected ? variantDisplayName(created) : '')
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
          value={showSelected && !open && selected ? variantDisplayName(selected) : query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            if (showSelected && selectedProductId) onClear?.()
          }}
          onFocus={() => {
            if (showSelected && selected) setQuery(variantDisplayName(selected))
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleEnter()
            }
          }}
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
                const tracksPieces = !isPurchase && product.trackPieces
                const expanded = expandedProductId === product.id
                const pieces = (piecesByProduct[product.id] ?? []).filter(
                  (piece) => !usedPieceIds.includes(piece.id),
                )
                const availability = tracksPieces
                  ? `${pieces.length || product.stockQty} piece${product.stockQty === 1 ? '' : 's'} · pick a tag`
                  : isPurchase
                    ? `${product.stockQty} in stock`
                    : stockAvailabilityLabel(product.stockQty, used)
                const unavailable = tracksPieces
                  ? product.stockQty <= 0
                  : isPurchase
                    ? false
                    : used >= product.stockQty
                if (!tracksPieces) {
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
                }
                return (
                  <div key={product.id} className="billing-customer-piece-group">
                    <button
                      type="button"
                      className={`billing-customer-option${unavailable ? ' billing-customer-option--unavailable' : ''}`}
                      aria-expanded={expanded}
                      aria-disabled={unavailable}
                      title={availability}
                      disabled={unavailable}
                      onClick={() => void togglePieces(product)}
                    >
                      <span className="billing-customer-option-name" title={variantDisplayName(product)}>
                        {expanded ? (
                          <ChevronDown size={14} strokeWidth={2} aria-hidden />
                        ) : (
                          <ChevronRight size={14} strokeWidth={2} aria-hidden />
                        )}{' '}
                        {variantDisplayName(product)}
                      </span>
                      <span className="billing-customer-option-meta" title={meta}>
                        {meta}
                        {meta ? ' · ' : ''}
                        <span className="billing-customer-option-stock">{availability}</span>
                      </span>
                    </button>
                    {expanded ? (
                      <div className="billing-customer-pieces">
                        {pieces.map((piece) => (
                          <button
                            key={piece.id}
                            type="button"
                            className="billing-customer-option billing-customer-option--piece"
                            onClick={() => pickPiece(product, piece)}
                          >
                            <span className="billing-customer-option-name">{piece.tagCode}</span>
                            <span className="billing-customer-option-meta">
                              {[piece.huid || 'No HUID', `${formatWeight(piece.netWeight)} net`]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </button>
                        ))}
                        {pieces.length === 0 ? (
                          <span className="billing-customer-option-meta billing-customer-pieces-empty">
                            Every piece of this design is already on a bill or out of stock.
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
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
          initialValues={newProductValues}
          source={isPurchase ? 'purchase' : 'products'}
          onClose={() => setModalOpen(false)}
          onSave={saveNewProduct}
        />
      ) : null}
    </div>
  )
}
