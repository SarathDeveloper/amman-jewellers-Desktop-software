import { ArrowLeft, FileText, Layers, PackagePlus, Pencil, Scale, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { Product } from '@shared/types'
import { Modal } from '../../components/Modal'
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
  onAddVariant,
  onAddInward,
  onAdjust,
  onEdit,
  onDelete,
  onViewChild,
}: {
  product: Product
  products: Product[]
  onClose: () => void
  onAddVariant: (product: Product) => void
  onAddInward: (product: Product) => void
  onAdjust: (product: Product) => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onViewChild: (product: Product) => void
}) {
  const title = variantDisplayName(product)
  const stockQty = effectiveStockQty(product, products)
  const taggedHuidCount = (product.huids ?? []).length
  const ownStockQty = product.stockQty
  const hasVariants = productHasVariants(products, product.id)
  const variants = childProducts(products, product.id)
  const isParent = product.parentId == null
  const attributeEntries = Object.entries(product.attributes).filter(
    ([key, value]) => key.trim() && value.trim(),
  )

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
            {isParent ? (
              <button type="button" className="btn secondary" onClick={() => onAddVariant(product)}>
                <Layers size={16} strokeWidth={2} aria-hidden />
                Add variant
              </button>
            ) : (
              <button type="button" className="btn secondary" onClick={() => onAddInward(product)}>
                <PackagePlus size={16} strokeWidth={2} aria-hidden />
                Add stock
              </button>
            )}
            {!hasVariants ? (
              <button type="button" className="btn secondary" onClick={() => onAdjust(product)}>
                <SlidersHorizontal size={16} strokeWidth={2} aria-hidden />
                Adjust stock
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
        </div>
      </div>
    </Modal>
  )
}
