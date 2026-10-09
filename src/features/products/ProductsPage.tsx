import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Coins,
  Gem,
  LayoutGrid,
  Package,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  Table2,
} from 'lucide-react'
import type { Product, ProductInput } from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable, TablePager } from '../../components/DataTable'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { SearchBar } from '../../components/SearchBar'
import { useToast } from '../../components/toastContext'
import { formatCurrency, formatWeight, paginate } from '../../lib/format'
import { api } from '../../lib/api'
import { InwardEditorModal } from '../inwards/InwardEditorModal'
import { AdjustStockModal } from './AdjustStockModal'
import { ProductDetailModal } from './ProductDetailModal'
import { ProductFormModal } from './ProductFormModal'
import {
  childProducts,
  effectiveStockQty,
  isGold,
  isSilver,
  MetalCell,
  parentOrStandaloneProducts,
  ProductThumb,
  productHasVariants,
  StockBadge,
  stockTone,
  variantDisplayName,
  type StockTone,
} from './productDisplay'
import { productMatchesListContext } from './productForm'

type StockFilter = 'all' | StockTone
type ViewMode = 'table' | 'grid'

const PRODUCT_PAGE_SIZES = [10, 25, 50]
const DEFAULT_PAGE_SIZE = 10

function shareOfTotal(part: number, total: number): string {
  if (total === 0) return '0% of total'
  return `${Math.round((part / total) * 100)}% of total`
}

export function ProductsPage() {
  const { showToast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [purity, setPurity] = useState('all')
  const [metal, setMetal] = useState('all')
  const [stockStatus, setStockStatus] = useState<StockFilter>('all')
  const [view, setView] = useState<ViewMode>('table')
  const [selected, setSelected] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Product | null>(null)
  const [variantParent, setVariantParent] = useState<Product | null>(null)
  const [viewing, setViewing] = useState<Product | null>(null)
  const [open, setOpen] = useState(false)
  const [inwardProducts, setInwardProducts] = useState<Product[] | null>(null)
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number[] | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (active) {
          setError(null)
          if (hasLoadedRef.current) setRefreshing(true)
          else setLoading(true)
        }
        const data = await api.listProducts(searchQuery)
        if (active) {
          setProducts(data)
          hasLoadedRef.current = true
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load products')
        }
      } finally {
        if (active) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [searchQuery])

  useEffect(() => {
    setSelected((current) => current.filter((id) => products.some((product) => product.id === id)))
  }, [products])

  useEffect(() => {
    setViewing((current) => {
      if (!current) return current
      return products.find((product) => product.id === current.id) ?? null
    })
  }, [products])

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort(),
    [products],
  )
  const purities = useMemo(
    () => Array.from(new Set(products.map((product) => product.purity).filter(Boolean))).sort(),
    [products],
  )

  const stats = useMemo(() => {
    const sellable = products.filter((product) => !productHasVariants(products, product.id))
    const gold = sellable.filter((product) => isGold(product.metal)).length
    const silver = sellable.filter((product) => isSilver(product.metal)).length
    const low = sellable.filter((product) => stockTone(effectiveStockQty(product, products)) === 'low').length
    return {
      total: sellable.length,
      gold,
      silver,
      low,
    }
  }, [products])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      if (metal !== 'all' && !product.metal.toLowerCase().includes(metal)) return false
      if (category !== 'all' && product.category !== category) return false
      if (purity !== 'all' && product.purity !== purity) return false
      if (
        stockStatus !== 'all' &&
        stockTone(effectiveStockQty(product, products)) !== stockStatus
      ) {
        return false
      }
      if (!query) return true
      return [
        product.name,
        product.category,
        product.variantCode,
        product.size,
        product.stoneDetails,
        ...(product.huids ?? []),
      ].some((value) => value.toLowerCase().includes(query))
    })
  }, [products, metal, category, purity, stockStatus, search])

  const visibleParents = useMemo(() => {
    const matching = new Set(filtered.map((product) => product.id))
    const parentIds = new Set<number>()
    for (const product of filtered) {
      if (product.parentId == null) parentIds.add(product.id)
      else parentIds.add(product.parentId)
    }
    return parentOrStandaloneProducts(products).filter((product) => parentIds.has(product.id) || matching.has(product.id))
  }, [filtered, products])

  const lastPage = Math.max(1, Math.ceil(visibleParents.length / pageSize))
  const safePage = Math.min(page, lastPage)
  const paged = useMemo(
    () => paginate(visibleParents, safePage, pageSize),
    [visibleParents, safePage, pageSize],
  )

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  const pageIds = paged.map((product) => product.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id))
  const somePageSelected = pageIds.some((id) => selected.includes(id))
  const emptyCatalogue = products.length === 0 && !search.trim()
  const noMatches = !emptyCatalogue && visibleParents.length === 0

  async function load(query = search) {
    try {
      setError(null)
      const data = await api.listProducts(query)
      setProducts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    }
  }

  function openCreate() {
    setEditing(null)
    setVariantParent(null)
    setOpen(true)
  }

  function openCreateVariant(parent: Product) {
    setEditing(null)
    setVariantParent(parent)
    setOpen(true)
  }

  function openEdit(product: Product) {
    setEditing(product)
    setVariantParent(
      product.parentId != null
        ? (products.find((row) => row.id === product.parentId) ?? null)
        : null,
    )
    setOpen(true)
  }

  function resetFilters() {
    setCategory('all')
    setPurity('all')
    setMetal('all')
    setStockStatus('all')
    setPage(1)
  }

  async function revealAfterSave(input: ProductInput, isCreate: boolean) {
    const keepContext =
      !isCreate &&
      productMatchesListContext(input, { search, metal, category, purity, stockStatus })
    if (!keepContext) {
      resetFilters()
      if (search.trim()) {
        setSearch('')
        return
      }
    }
    await load(keepContext ? search : '')
  }

  function openInward(product: Product) {
    setInwardProducts([product])
  }

  function openAdjust(product: Product) {
    setAdjustingProduct(product)
  }

  function openInwardSelected() {
    const rows = products.filter((product) => selected.includes(product.id))
    if (rows.length === 0) return
    setInwardProducts(rows)
  }

  function openInwardHeader() {
    const rows = products.filter((product) => selected.includes(product.id))
    if (rows.length === 0) {
      showToast('Select one or more products to add inward stock', 'info')
      return
    }
    setInwardProducts(rows)
  }

  async function handleInwardSaved() {
    setInwardProducts(null)
    setSelected([])
    await load()
  }

  async function handleAdjustSaved() {
    setAdjustingProduct(null)
    await load()
  }

  async function handleSave(input: ProductInput) {
    const isCreate = !editing
    if (editing) {
      await api.updateProduct(editing.id, input)
      showToast('Product updated', 'success')
    } else {
      await api.createProduct(input)
      showToast(input.parentId ? 'Variant added' : 'Product added', 'success')
    }
    setOpen(false)
    setEditing(null)
    setVariantParent(null)
    await revealAfterSave(input, isCreate)
  }

  async function remove(ids: number[]) {
    try {
      for (const id of ids) {
        await api.deleteProduct(id)
      }
      setPendingDelete(null)
      setSelected((current) => current.filter((id) => !ids.includes(id)))
      showToast(ids.length === 1 ? 'Product deleted' : 'Products deleted', 'success')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product')
    }
  }

  function toggleSelected(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  function visibleChildren(parent: Product): Product[] {
    const matching = new Set(filtered.map((product) => product.id))
    const parentMatched = matching.has(parent.id)
    return childProducts(products, parent.id).filter((child) => parentMatched || matching.has(child.id))
  }

  function togglePageSelection() {
    if (allPageSelected) {
      setSelected((current) => current.filter((id) => !pageIds.includes(id)))
      return
    }
    setSelected((current) => Array.from(new Set([...current, ...pageIds])))
  }

  return (
    <div className={`app-page products-page${view === 'table' ? ' app-page-fill' : ''}`}>
      <header className="page-header app-page-header products-page-header">
        <div>
          <h1>Products</h1>
          <p className="page-subtitle muted">Manage jewellery catalogue and piece inventory</p>
        </div>
        <div className="products-search">
          <Search size={16} strokeWidth={2} aria-hidden />
          <SearchBar
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            placeholder="Search products, variants, size, code or HUID..."
          />
        </div>
        <div className="products-header-actions">
          <button type="button" className="btn" onClick={openCreate}>
            <Plus size={18} strokeWidth={2} aria-hidden />
            Add product
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={openInwardHeader}
            disabled={selected.length === 0}
          >
            <PackagePlus size={16} aria-hidden />
            Add inward stock
          </button>
        </div>
      </header>

      <div className="stat-card-grid products-kpi-grid">
        <div className="card padded dashboard-kpi-card products-kpi-card">
          <div className="dashboard-kpi-icon dashboard-kpi-icon-brand">
            <Package size={20} strokeWidth={1.75} aria-hidden />
          </div>
          <div className="dashboard-kpi-body">
            <span className="kpi-label">Total products</span>
            <span className="kpi-value num">{stats.total}</span>
          </div>
        </div>
        <div className="card padded dashboard-kpi-card products-kpi-card">
          <div className="dashboard-kpi-icon products-kpi-icon-gold">
            <Coins size={20} strokeWidth={1.75} aria-hidden />
          </div>
          <div className="dashboard-kpi-body">
            <span className="kpi-label">Gold products</span>
            <span className="kpi-value num">{stats.gold}</span>
            <span className="dashboard-kpi-hint">{shareOfTotal(stats.gold, stats.total)}</span>
          </div>
        </div>
        <div className="card padded dashboard-kpi-card products-kpi-card">
          <div className="dashboard-kpi-icon products-kpi-icon-silver">
            <Gem size={20} strokeWidth={1.75} aria-hidden />
          </div>
          <div className="dashboard-kpi-body">
            <span className="kpi-label">Silver products</span>
            <span className="kpi-value num">{stats.silver}</span>
            <span className="dashboard-kpi-hint">{shareOfTotal(stats.silver, stats.total)}</span>
          </div>
        </div>
        <button
          type="button"
          className="card padded dashboard-kpi-card products-kpi-card products-kpi-card-low"
          onClick={() => {
            setStockStatus('low')
            setPage(1)
          }}
        >
          <div className="dashboard-kpi-icon dashboard-kpi-icon-danger">
            <AlertTriangle size={20} strokeWidth={1.75} aria-hidden />
          </div>
          <div className="dashboard-kpi-body">
            <span className="kpi-label">Low stock</span>
            <span className="kpi-value num">{stats.low}</span>
            <span className="products-kpi-link">View low stock</span>
          </div>
        </button>
      </div>

      <div className="products-toolbar">
        <div className="filter-bar products-metal-pills">
          {(
            [
              { value: 'all', label: `All (${stats.total})` },
              { value: 'gold', label: `Gold (${stats.gold})` },
              { value: 'silver', label: `Silver (${stats.silver})` },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              className={`filter-chip${metal === option.value ? ' active' : ''}`}
              onClick={() => {
                setMetal(option.value)
                setPage(1)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="products-toolbar-filters">
          <select
            className="select"
            value={category}
            aria-label="All categories"
            onChange={(e) => {
              setCategory(e.target.value)
              setPage(1)
            }}
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={purity}
            aria-label="All purity"
            onChange={(e) => {
              setPurity(e.target.value)
              setPage(1)
            }}
          >
            <option value="all">All purity</option>
            {purities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={stockStatus}
            aria-label="Stock status"
            onChange={(e) => {
              setStockStatus(e.target.value as StockFilter)
              setPage(1)
            }}
          >
            <option value="all">Stock status</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          <button type="button" className="btn secondary products-reset" onClick={resetFilters}>
            <RotateCcw size={15} strokeWidth={2} aria-hidden />
            Reset
          </button>
        </div>
        <div className="products-view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={view === 'grid' ? 'active' : ''}
            aria-pressed={view === 'grid'}
            aria-label="Grid"
            onClick={() => setView('grid')}
          >
            <LayoutGrid size={16} strokeWidth={2} aria-hidden />
            Grid
          </button>
          <button
            type="button"
            className={view === 'table' ? 'active' : ''}
            aria-pressed={view === 'table'}
            aria-label="Table"
            onClick={() => setView('table')}
          >
            <Table2 size={16} strokeWidth={2} aria-hidden />
            Table
          </button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="products-selection-bar">
          <span>{selected.length} selected</span>
          <div className="row-actions">
            <button type="button" className="btn" onClick={openInwardSelected}>
              <PackagePlus size={16} aria-hidden />
              Add inward to selected
            </button>
            <button type="button" className="btn danger" onClick={() => setPendingDelete(selected)}>
              Delete selected
            </button>
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {refreshing ? <p className="muted list-refreshing-hint">Updating…</p> : null}

      {loading ? (
        <LoadingState />
      ) : emptyCatalogue ? (
        <EmptyState
          title="No products yet"
          description="Start building your jewellery catalogue."
          action={
            <button type="button" className="btn" onClick={openCreate}>
              <Plus size={18} strokeWidth={2} aria-hidden />
              Add your first product
            </button>
          }
        />
      ) : noMatches ? (
        <EmptyState
          title="No matching products"
          description="Try another search or reset the filters."
          action={
            <button type="button" className="btn secondary" onClick={resetFilters}>
              <RotateCcw size={15} strokeWidth={2} aria-hidden />
              Reset filters
            </button>
          }
        />
      ) : view === 'grid' ? (
        <>
          <div className="products-grid">
            {paged.map((product) => {
              const variants = visibleChildren(product)
              const hasVariants = variants.length > 0 || productHasVariants(products, product.id)
              const stockQty = effectiveStockQty(product, products)
              const pieceName = variantDisplayName(product)
              return (
                <article
                  key={product.id}
                  className="card padded products-grid-card products-grid-card-open"
                  onClick={() => setViewing(product)}
                >
                  <div className="products-grid-top">
                    <label
                      className="products-grid-check"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(product.id)}
                        onChange={() => toggleSelected(product.id)}
                        aria-label={`Select ${pieceName}`}
                      />
                      <ProductThumb metal={product.metal} imagePath={product.imagePath} name={pieceName} />
                    </label>
                    <div className="products-grid-body">
                      <strong>{pieceName}</strong>
                      <span className="muted">{product.category || '—'}</span>
                      <MetalCell metal={product.metal} />
                      {hasVariants ? (
                        <span className="products-variant-count">
                          {childProducts(products, product.id).length} variants
                        </span>
                      ) : null}
                      <div className="products-grid-meta">
                        <span className={`num stock-qty ${stockTone(stockQty)}`}>{stockQty}</span>
                        <StockBadge qty={stockQty} />
                      </div>
                    </div>
                  </div>
                  {variants.length > 0 ? (
                    <ul className="products-grid-variants">
                      {variants.map((child) => (
                        <li key={child.id}>
                          <button
                            type="button"
                            className="products-grid-variant-open"
                            onClick={(event) => {
                              event.stopPropagation()
                              setViewing(child)
                            }}
                          >
                            <span>{variantDisplayName(child)}</span>
                            <span className={`num stock-qty ${stockTone(child.stockQty)}`}>{child.stockQty}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              )
            })}
          </div>
          <div className="card products-grid-pager">
            <TablePager
              page={safePage}
              pageSize={pageSize}
              total={visibleParents.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={PRODUCT_PAGE_SIZES}
              itemLabel="products"
            />
          </div>
        </>
      ) : (
        <DataTable
          footer={
            <TablePager
              page={safePage}
              pageSize={pageSize}
              total={visibleParents.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={PRODUCT_PAGE_SIZES}
              itemLabel="products"
            />
          }
        >
          <table>
            <thead>
              <tr>
                <th className="products-check-col">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(element) => {
                      if (element) element.indeterminate = somePageSelected && !allPageSelected
                    }}
                    onChange={togglePageSelection}
                    aria-label="Select all on this page"
                  />
                </th>
                <th>Image</th>
                <th>Name</th>
                <th>Category</th>
                <th>Metal</th>
                <th>Purity</th>
                <th className="num">Gross wt.</th>
                <th className="num">Net wt.</th>
                <th className="num">Making</th>
                <th className="num">Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((product) => {
                const variants = visibleChildren(product)
                const hasVariants = productHasVariants(products, product.id)
                const stockQty = effectiveStockQty(product, products)
                const tone = stockTone(stockQty)
                const pieceName = variantDisplayName(product)
                return (
                  <Fragment key={product.id}>
                    <tr
                      className={`products-row-open${selected.includes(product.id) ? ' is-selected' : ''}`}
                      onClick={() => setViewing(product)}
                    >
                      <td
                        className="products-check-col"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(product.id)}
                          onChange={() => toggleSelected(product.id)}
                          aria-label={`Select ${pieceName}`}
                        />
                      </td>
                      <td>
                        <ProductThumb metal={product.metal} imagePath={product.imagePath} name={pieceName} />
                      </td>
                      <td>
                        <div className="products-name-cell">
                          <span className="products-expand-spacer" aria-hidden />
                          <span className="products-variant-copy">
                            <span>
                              {pieceName}
                              {hasVariants ? (
                                <span className="products-variant-count">
                                  {childProducts(products, product.id).length} variants
                                </span>
                              ) : null}
                            </span>
                            {product.variantCode ? (
                              <span className="muted">{product.variantCode}</span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td>{product.category}</td>
                      <td>
                        <MetalCell metal={product.metal} />
                      </td>
                      <td>{product.purity}</td>
                      <td className="num">{formatWeight(product.grossWeight)}</td>
                      <td className="num">{formatWeight(product.netWeight)}</td>
                      <td className="num">{formatCurrency(product.makingCharges)}</td>
                      <td className={`num stock-qty ${tone}`}>{stockQty}</td>
                      <td>
                        <StockBadge qty={stockQty} />
                      </td>
                    </tr>
                    {variants.map((child) => {
                          const childTone = stockTone(child.stockQty)
                          return (
                            <tr
                              key={child.id}
                              className={`products-variant-row products-row-open${selected.includes(child.id) ? ' is-selected' : ''}`}
                              onClick={() => setViewing(child)}
                            >
                              <td
                                className="products-check-col"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected.includes(child.id)}
                                  onChange={() => toggleSelected(child.id)}
                                  aria-label={`Select ${variantDisplayName(child)}`}
                                />
                              </td>
                              <td>
                                <ProductThumb
                                  metal={child.metal}
                                  imagePath={child.imagePath || product.imagePath}
                                  name={variantDisplayName(child)}
                                />
                              </td>
                              <td>
                                <div className="products-name-cell products-name-cell-variant">
                                  <span className="products-expand-spacer" aria-hidden />
                                  <span className="products-variant-copy">
                                    <span>{variantDisplayName(child)}</span>
                                    {child.variantCode ? (
                                      <span className="muted">{child.variantCode}</span>
                                    ) : null}
                                  </span>
                                </div>
                              </td>
                              <td>{child.category}</td>
                              <td>
                                <MetalCell metal={child.metal} />
                              </td>
                              <td>{child.purity}</td>
                              <td className="num">{formatWeight(child.grossWeight)}</td>
                              <td className="num">{formatWeight(child.netWeight)}</td>
                              <td className="num">{formatCurrency(child.makingCharges)}</td>
                              <td className={`num stock-qty ${childTone}`}>{child.stockQty}</td>
                              <td>
                                <StockBadge qty={child.stockQty} />
                              </td>
                            </tr>
                          )
                        })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </DataTable>
      )}

      {viewing ? (
        <ProductDetailModal
          product={viewing}
          products={products}
          onClose={() => setViewing(null)}
          onAddVariant={openCreateVariant}
          onAddInward={openInward}
          onAdjust={openAdjust}
          onEdit={openEdit}
          onDelete={(product) => setPendingDelete([product.id])}
          onViewChild={setViewing}
        />
      ) : null}

      {open && (
        <ProductFormModal
          product={editing}
          products={products}
          parentProduct={variantParent}
          onClose={() => {
            setOpen(false)
            setVariantParent(null)
          }}
          onSave={handleSave}
        />
      )}

      {inwardProducts != null && inwardProducts.length > 0 ? (
        <InwardEditorModal
          inward={null}
          readOnly={false}
          initialProducts={inwardProducts}
          onClose={() => setInwardProducts(null)}
          onSaved={handleInwardSaved}
        />
      ) : null}

      {adjustingProduct ? (
        <AdjustStockModal
          product={adjustingProduct}
          allProducts={products}
          onClose={() => setAdjustingProduct(null)}
          onSaved={handleAdjustSaved}
        />
      ) : null}

      {pendingDelete !== null && (
        <ConfirmDialog
          title={pendingDelete.length === 1 ? 'Delete product' : 'Delete products'}
          message={
            pendingDelete.length === 1
              ? productHasVariants(products, pendingDelete[0])
                ? 'This design has variants. Delete the variants first.'
                : 'Delete this product?'
              : `Delete ${pendingDelete.length} products?`
          }
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove(pendingDelete)}
        />
      )}
    </div>
  )
}
