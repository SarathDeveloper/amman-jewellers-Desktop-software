import { Gem } from 'lucide-react'
import type { Product } from '@shared/types'
import { localImageSrc } from '../invoices/mapShopDisplay'

export type StockTone = 'in' | 'low' | 'out'

export function isGold(metal: string): boolean {
  return metal.toLowerCase().includes('gold')
}

export function isSilver(metal: string): boolean {
  return metal.toLowerCase().includes('silver')
}

export function stockTone(qty: number): StockTone {
  if (qty <= 0) return 'out'
  if (qty <= 5) return 'low'
  return 'in'
}

export function stockLabel(tone: StockTone): string {
  if (tone === 'out') return 'Out of Stock'
  if (tone === 'low') return 'Low Stock'
  return 'In Stock'
}

function compactWeight(weight: number): string {
  if (weight <= 0) return ''
  const text = weight.toFixed(3).replace(/\.?0+$/, '')
  return `${text}g`
}

export function variantDisplayName(product: Product): string {
  const parts = [product.name.trim() || 'Product']
  const weight = compactWeight(product.netWeight)
  if (weight) parts.push(weight)
  if (product.size.trim()) parts.push(`Size ${product.size.trim()}`)
  return parts.join(' / ')
}

export function childProducts(products: Product[], parentId: number): Product[] {
  return products
    .filter((product) => product.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name) || a.netWeight - b.netWeight)
}

export function parentOrStandaloneProducts(products: Product[]): Product[] {
  return products.filter((product) => product.parentId == null)
}

export function productHasVariants(products: Product[], productId: number): boolean {
  return products.some((product) => product.parentId === productId)
}

export function effectiveStockQty(product: Product, products: Product[]): number {
  return childProducts(products, product.id).reduce(
    (sum, child) => sum + child.stockQty,
    product.stockQty,
  )
}

export function sellableProducts(products: Product[]): Product[] {
  const parentIds = new Set(
    products.map((product) => product.parentId).filter((id): id is number => id != null),
  )
  return products.filter((product) => {
    if (!product.isActive) return false
    if (!parentIds.has(product.id)) return true
    return product.netWeight > 0 || product.size.trim() !== '' || product.variantCode.trim() !== ''
  })
}

export function ProductThumb({
  metal,
  imagePath,
  name,
}: {
  metal: string
  imagePath?: string
  name?: string
}) {
  const silver = isSilver(metal)
  if (imagePath) {
    return (
      <span className="product-thumb product-thumb-photo">
        <img src={localImageSrc(imagePath, '')} alt={name ?? ''} />
      </span>
    )
  }
  return (
    <span className={`product-thumb${silver ? ' silver' : ''}`} aria-hidden>
      <Gem size={16} strokeWidth={1.75} />
    </span>
  )
}

export function MetalCell({ metal }: { metal: string }) {
  const tone = isSilver(metal) ? 'silver' : isGold(metal) ? 'gold' : 'other'
  return (
    <span className="products-metal">
      <span className={`products-metal-dot ${tone}`} aria-hidden />
      {metal || '—'}
    </span>
  )
}

export function StockBadge({ qty }: { qty: number }) {
  const tone = stockTone(qty)
  return <span className={`badge products-stock-badge ${tone}`}>{stockLabel(tone)}</span>
}
