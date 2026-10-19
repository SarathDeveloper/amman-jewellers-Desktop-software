import { useEffect, useState } from 'react'
import { ArrowLeft, FileText, Layers, PackagePlus, Pencil, Scale, Tag, Trash2 } from 'lucide-react'
import type { InventoryPiece, Product } from '@shared/types'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { formatCurrency, formatWeight } from '../../lib/format'
import {
  childProducts,
  effectiveStockQty,
  productHasVariants,
  StockBadge,
  variantDisplayName,
} from './productDisplay'

function dash(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed : '—'
}

function DetailField({
  label,
  value,
  wide,
}: {
  label: string
  value: string
  wide?: boolean
}) {
  return (
    <div className={`product-detail-field${wide ? ' product-detail-field--wide' : ''}`}>
      <span className="product-detail-field-label">{label}</span>
      <span className="product-detail-field-value">{value}</span>
    </div>
  )
}

export function ProductDetailModal({
  product,
  products,
  onClose,
  onAddInward,
  onEdit,
  onDelete,
  onViewChild,
  onConverted,
}: {
  product: Product
  products: Product[]
  onClose: () => void
  onAddInward: (product: Product) => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onViewChild: (product: Product) => void
  onConverted?: (product: Product) => void
}) {
  const title = variantDisplayName(product)
  const stockQty = effectiveStockQty(product, products)
  const taggedHuidCount = (product.huids ?? []).length
  const ownStockQty = product.stockQty
  const hasVariants = productHasVariants(products, product.id)
  const variants = childProducts(products, product.id)
  const attributeEntries = Object.entries(product.attributes).filter(
    ([key, value]) => key.trim() && value.trim(),
  )
  const [pieces, setPieces] = useState<InventoryPiece[]>([])
  const [piecesLoading, setPiecesLoading] = useState(false)
  const [pieceError, setPieceError] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    if (!product.trackPieces) {
      setPieces([])
      return
    }
    let cancelled = false
    setPiecesLoading(true)
    setPieceError(null)
    api
      .listProductPieces(product.id)
      .then((rows) => {
        if (!cancelled) setPieces(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setPieceError(err instanceof Error ? err.message : 'Failed to load pieces')
      })
      .finally(() => {
        if (!cancelled) setPiecesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [product.id, product.trackPieces])

  async function startTracking() {
    setConverting(true)
    setPieceError(null)
    try {
      const updated = await api.convertProductToTracked(product.id)
      onConverted?.(updated)
    } catch (err) {
      setPieceError(err instanceof Error ? err.message : 'Failed to start piece tracking')
    } finally {
      setConverting(false)
    }
  }

  return (
    <Modal className="product-detail-modal" title={title} hideTitle footer={null} onClose={onClose}>
      <div className="product-detail-shell">
        <header className="product-detail-header">
          <div className="product-detail-header-main">
            <button
              type="button"
              className="btn ghost icon-btn product-detail-back"
              aria-label="Close"
              onClick={onClose}
            >
              <ArrowLeft size={20} strokeWidth={1.75} />
            </button>
            <div className="product-detail-title-wrap">
              <h2 className="product-detail-title">{title}</h2>
              <StockBadge qty={stockQty} />
            </div>
          </div>
          <div className="product-detail-header-actions">
            {!hasVariants ? (
              <button type="button" className="btn secondary" onClick={() => onAddInward(product)}>
                <PackagePlus size={16} strokeWidth={2} aria-hidden />
                Add stock
              </button>
            ) : null}
            <button type="button" className="btn secondary" onClick={() => onEdit(product)}>
              <Pencil size={16} strokeWidth={2} aria-hidden />
              Edit
            </button>
            <button
              type="button"
              className="btn ghost icon-btn link-danger product-detail-delete"
              aria-label="Delete"
              onClick={() => onDelete(product)}
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="product-detail-body">
          <div className="product-detail-cards">
            <section className="product-detail-card">
              <div className="product-detail-card-head">
                <FileText size={16} strokeWidth={1.75} aria-hidden />
                <h3>General details</h3>
              </div>
              <div className="product-detail-fields">
                <DetailField label="Item name" value={dash(product.name)} wide />
                <DetailField label="Variant code" value={dash(product.variantCode)} />
                <DetailField label="HUID" value={dash((product.huids ?? []).join(', '))} wide />
                {taggedHuidCount !== ownStockQty ? (
                  <p className="muted product-detail-huid-mismatch">
                    {taggedHuidCount === 1 ? '1 HUID tagged' : `${taggedHuidCount} HUIDs tagged`} ·{' '}
                    {ownStockQty} pcs in stock
                  </p>
                ) : null}
                <DetailField label="Category" value={dash(product.category)} />
                <DetailField label="Metal" value={dash(product.metal)} />
                <DetailField label="Purity" value={dash(product.purity)} />
                <DetailField label="Size" value={dash(product.size)} />
                <DetailField label="Current stock" value={`${stockQty} pcs`} />
                <DetailField label="Stone details" value={dash(product.stoneDetails)} wide />
                <DetailField label="Active" value={product.isActive ? 'Yes' : 'No'} />
                {attributeEntries.map(([key, value]) => (
                  <DetailField key={key} label={key} value={value} />
                ))}
              </div>
            </section>

            <section className="product-detail-card">
              <div className="product-detail-card-head">
                <Scale size={16} strokeWidth={1.75} aria-hidden />
                <h3>Weight and charges</h3>
              </div>
              <div className="product-detail-fields">
                <DetailField label="Gross weight" value={formatWeight(product.grossWeight)} />
                <DetailField label="Net weight" value={formatWeight(product.netWeight)} />
                <DetailField label="Stone weight" value={formatWeight(product.stoneWeight)} />
                <DetailField label="Making charges" value={formatCurrency(product.makingCharges)} />
              </div>
            </section>
          </div>

          {variants.length > 0 ? (
            <section className="product-detail-card product-detail-variants">
              <div className="product-detail-card-head">
                <Layers size={16} strokeWidth={1.75} aria-hidden />
                <h3>Variants</h3>
                <span className="product-detail-variant-count">{variants.length}</span>
              </div>
              <ul className="product-detail-variant-list">
                {variants.map((child) => (
                  <li key={child.id}>
                    <button type="button" onClick={() => onViewChild(child)}>
                      <span className="product-detail-variant-name">{variantDisplayName(child)}</span>
                      {child.variantCode ? (
                        <span className="muted">{child.variantCode}</span>
                      ) : null}
                      <span className="num product-detail-variant-stock">{child.stockQty} pcs</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {product.trackPieces ? (
            <section className="product-detail-card product-detail-pieces-card">
              <div className="product-detail-card-head">
                <Tag size={16} strokeWidth={1.75} aria-hidden />
                <h3>Pieces</h3>
                <span className="product-detail-variant-count">
                  {pieces.filter((piece) => piece.status === 'in_stock').length} in stock
                </span>
              </div>
              {pieceError ? <p className="form-error">{pieceError}</p> : null}
              {piecesLoading ? (
                <p className="muted">Loading pieces…</p>
              ) : pieces.length === 0 ? (
                <p className="muted">No pieces yet. They are created when you add stock from a purchase.</p>
              ) : (
                <div className="product-detail-pieces-wrap">
                  <table className="product-detail-pieces">
                    <thead>
                      <tr>
                        <th>Tag</th>
                        <th>HUID</th>
                        <th>Net wt</th>
                        <th>Cost</th>
                        <th>Status</th>
                        <th>Purchase</th>
                        <th>Bill</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pieces.map((piece) => (
                        <tr key={piece.id}>
                          <td className="num">{piece.tagCode}</td>
                          <td>{piece.huid || '—'}</td>
                          <td className="num">{formatWeight(piece.netWeight)}</td>
                          <td className="num">
                            {piece.cost == null ? '—' : formatCurrency(piece.cost)}
                          </td>
                          <td className="product-detail-piece-status">{piece.status}</td>
                          <td>{piece.inwardNo || '—'}</td>
                          <td>{piece.invoiceNo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <section className="product-detail-card">
              <div className="product-detail-card-head">
                <Tag size={16} strokeWidth={1.75} aria-hidden />
                <h3>Piece tracking</h3>
              </div>
              <p className="muted">
                Off. Turn it on to give each of the {ownStockQty} piece
                {ownStockQty === 1 ? '' : 's'} its own tag, weight and HUID.
              </p>
              <button
                type="button"
                className="btn secondary"
                disabled={converting}
                onClick={() => void startTracking()}
              >
                {converting ? 'Starting…' : 'Start tracking pieces'}
              </button>
            </section>
          )}
        </div>
      </div>
    </Modal>
  )
}
