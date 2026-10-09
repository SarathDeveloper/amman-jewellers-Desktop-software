import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  History,
  Lock,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Scale,
  Search,
  Table2,
  Trash2,
  Unlock,
} from 'lucide-react'
import { STOCK_METALS, type StockMetal } from '@shared/itemTypes'
import { localTodayIso } from '@shared/localDate'
import type {
  DayClosePrecheck,
  ItemStockRow,
  MetalDayClosingSheet,
  MetalDayPieceRow,
  StockDayLine,
  StockDayLineKind,
  StockHistoryRow,
  Inward,
} from '@shared/types'
import { EmptyState } from '../../components/EmptyState'
import { DateInput } from '../../components/DateInput'
import { LoadingState } from '../../components/LoadingState'
import { MetalBarIcon } from '../../components/MetalBarIcon'
import { Modal } from '../../components/Modal'
import { PageHeader } from '../../components/PageHeader'
import { SearchBar } from '../../components/SearchBar'
import { useToast } from '../../components/toastContext'
import { useAuth } from '../auth/authContext'
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatWeight } from '../../lib/format'
import { api } from '../../lib/api'
import { numericFieldToNumber, type NumericField } from '../../lib/numericField'
import { isGold, isSilver } from '../products/productDisplay'
import { sumMetalStock } from '../dashboard/dashboardStats'
import { CategoryFormModal } from './CategoryFormModal'
import {
  ClosingStockSummary,
  type ClosingSummaryMode,
} from './ClosingStockSummary'
import { DeleteCategoryModal } from './DeleteCategoryModal'
import { ReconciliationReport } from './ReconciliationReport'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'

/** Above the default category count so a standard list stays on one page. */
const CATEGORY_PAGE_SIZE = 25

type StockTab = 'category' | 'closing' | 'inward' | 'pieces' | 'history' | 'reconcile'
type PanelMode = 'edit' | 'add'

type CategoryForm = {
  name: string
  openingWeight: NumericField
  salesOverride: NumericField
  overrideReason: string
}

const emptyForm: CategoryForm = {
  name: '',
  openingWeight: '',
  salesOverride: '',
  overrideReason: '',
}

function formFromRow(row: ItemStockRow): CategoryForm {
  return {
    name: row.itemName,
    openingWeight: row.openingWeight,
    salesOverride: row.salesOverride ?? '',
    overrideReason: row.overrideReason ?? '',
  }
}

function formatStockNumber(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(value)
}

function getCategoryIconClass(name: string): string {
  const norm = name.toLowerCase().trim()
  const colorMap: Record<string, string> = {
    chain: 'stock-category-icon-chain',
    necklace: 'stock-category-icon-necklace',
    haram: 'stock-category-icon-haram',
    bangle: 'stock-category-icon-bangle',
    ring: 'stock-category-icon-ring',
    stud: 'stock-category-icon-stud',
    mattal: 'stock-category-icon-mattal',
  }
  return colorMap[norm] ?? ''
}

function CategoryIcon({ name }: { name: string }) {
  const norm = name.toLowerCase().trim()
  const svgProps = {
    viewBox: '0 0 24 24',
    width: '20',
    height: '20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (norm === 'chain') {
    return (
      <svg {...svgProps}>
        <path d="M9.5 14.5a3.5 3.5 0 1 1 0-7h2.2" />
        <path d="M14.5 9.5a3.5 3.5 0 1 1 0 7h-2.2" />
      </svg>
    )
  }
  if (norm === 'necklace') {
    return (
      <svg {...svgProps}>
        <path d="M5 6.5c.5 8 4.2 12.2 7 14 2.8-1.8 6.5-6 7-14" />
        <circle cx="12" cy="20.2" r="1.7" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (norm === 'haram') {
    return (
      <svg {...svgProps}>
        <path d="M4 5.5c.4 10 4.6 14.5 8 16 3.4-1.5 7.6-6 8-16" />
        <path d="M7 8c.4 7.2 3 10.6 5 11.8 2-1.2 4.6-4.6 5-11.8" />
      </svg>
    )
  }
  if (norm === 'bangle') {
    return (
      <svg {...svgProps}>
        <ellipse cx="12" cy="12" rx="8.5" ry="5.2" />
        <ellipse cx="12" cy="12" rx="5.6" ry="2.8" />
      </svg>
    )
  }
  if (norm === 'ring') {
    return (
      <svg {...svgProps}>
        <circle cx="12" cy="14.5" r="5.2" />
        <path d="M10 9.4 12 4.8 14 9.4Z" fill="currentColor" />
      </svg>
    )
  }
  if (norm === 'stud') {
    return (
      <svg {...svgProps}>
        <circle cx="8" cy="13" r="2.4" fill="currentColor" stroke="none" />
        <circle cx="16" cy="13" r="2.4" fill="currentColor" stroke="none" />
        <path d="M8 10.4V7.2M16 10.4V7.2" />
      </svg>
    )
  }
  if (norm === 'mattal') {
    return (
      <svg {...svgProps}>
        <path d="M8 5.5v11.5" />
        <path d="M16 5.5v11.5" />
        <path d="M8 17c0 2.4 8 2.4 8 0" />
        <circle cx="12" cy="19.6" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  return (
    <svg {...svgProps}>
      <polygon points="12 3 14.9 8.8 21.3 9.7 16.6 14.1 17.7 20.5 12 17.6 6.3 20.5 7.4 14.1 2.7 9.7 9.1 8.8 12 3" />
    </svg>
  )
}

export function StockPage() {
  const { showToast } = useToast()
  const { user, isAdmin } = useAuth()
  const [stockDate, setStockDate] = useState(() => localTodayIso())
  const [metal, setMetal] = useState<StockMetal>('Gold')
  const [goldRows, setGoldRows] = useState<ItemStockRow[]>([])
  const [silverRows, setSilverRows] = useState<ItemStockRow[]>([])
  const [goldSheet, setGoldSheet] = useState<MetalDayClosingSheet | null>(null)
  const [silverSheet, setSilverSheet] = useState<MetalDayClosingSheet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<StockTab>('category')
  const [summaryMode, setSummaryMode] = useState<ClosingSummaryMode>('transacted')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null)
  const [form, setForm] = useState<CategoryForm>(emptyForm)
  const [deleteName, setDeleteName] = useState<string | null>(null)
  const [categoryPage, setCategoryPage] = useState(1)
  const [historyRows, setHistoryRows] = useState<StockHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [inwards, setInwards] = useState<Inward[]>([])
  const [inwardsLoading, setInwardsLoading] = useState(false)
  const [expandedInwardId, setExpandedInwardId] = useState<number | null>(null)
  const [drill, setDrill] = useState<{
    itemName: string
    kind: StockDayLineKind
    lines: StockDayLine[]
  } | null>(null)
  const [closeNote, setCloseNote] = useState('')
  const [closeOpen, setCloseOpen] = useState(false)
  const [precheck, setPrecheck] = useState<DayClosePrecheck | null>(null)
  const [precheckLoading, setPrecheckLoading] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [printTarget, setPrintTarget] = useState<{ title: string; path: string } | null>(null)

  const daySheet = metal === 'Gold' ? goldSheet : silverSheet
  const dayClosed = daySheet?.status === 'closed'

  const load = useCallback(async () => {
    try {
      setError(null)
      const [gold, silver, goldDay, silverDay] = await Promise.all([
        api.listItemStock({ stockDate, metal: 'Gold' }),
        api.listItemStock({ stockDate, metal: 'Silver' }),
        api.getMetalDayClosing(stockDate, 'Gold'),
        api.getMetalDayClosing(stockDate, 'Silver'),
      ])
      setGoldRows(gold)
      setSilverRows(silver)
      setGoldSheet(goldDay)
      setSilverSheet(silverDay)
      return { gold, silver }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stock')
      return { gold: [] as ItemStockRow[], silver: [] as ItemStockRow[] }
    } finally {
      setLoading(false)
    }
  }, [stockDate])

  useEffect(() => {
    void load()
  }, [load])

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true)
      const rows = await api.listStockHistory({ metal })
      setHistoryRows(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stock history')
    } finally {
      setHistoryLoading(false)
    }
  }, [metal])

  useEffect(() => {
    if (tab !== 'history') return
    void loadHistory()
  }, [tab, loadHistory])

  const loadInwards = useCallback(async () => {
    try {
      setInwardsLoading(true)
      const rows = await api.listInwards()
      setInwards(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inwards')
    } finally {
      setInwardsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'inward') return
    void loadInwards()
  }, [tab, loadInwards])

  const rows = metal === 'Gold' ? goldRows : silverRows
  const goldSummary = useMemo(() => sumMetalStock(goldRows), [goldRows])
  const silverSummary = useMemo(() => sumMetalStock(silverRows), [silverRows])
  const pieceRows: MetalDayPieceRow[] = daySheet?.pieceRows ?? []

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => row.itemName.toLowerCase().includes(query))
  }, [rows, search])

  const paginatedRows = useMemo(() => {
    const start = (categoryPage - 1) * CATEGORY_PAGE_SIZE
    return filteredRows.slice(start, start + CATEGORY_PAGE_SIZE)
  }, [filteredRows, categoryPage])

  const filteredInwards = useMemo(() => {
    return inwards.filter((inv) => {
      if (inv.inwardDate !== stockDate) return false
      return inv.items.some((item) => (metal === 'Silver' ? isSilver(item.metal) : isGold(item.metal)))
    })
  }, [inwards, stockDate, metal])

  const selectedRow = rows.find((row) => row.itemName === selectedName) ?? null

  function openEditCategory(row: ItemStockRow) {
    setSelectedName(row.itemName)
    setPanelMode('edit')
    setForm(formFromRow(row))
  }

  function openAddCategory() {
    setSelectedName(null)
    setPanelMode('add')
    setForm(emptyForm)
    setTab('category')
  }

  function closeCategoryModal() {
    setPanelMode(null)
    setSelectedName(null)
    setForm(emptyForm)
  }

  const previewOpening = numericFieldToNumber(form.openingWeight)
  const previewSales =
    form.salesOverride === ''
      ? (selectedRow?.autoSales ?? 0)
      : numericFieldToNumber(form.salesOverride)
  const previewInward = selectedRow?.autoPurchaseIn ?? 0
  const previewClosing = previewOpening + previewInward - previewSales

  async function savePanel() {
    if (dayClosed) {
      setError('This metal day is closed. Reopen it before editing.')
      return
    }
    const name = form.name.trim()
    if (!name) {
      setError('Category name is required')
      return
    }
    setSaving(true)
    try {
      setError(null)
      if (panelMode === 'add') {
        await api.createStockCategory({
          name,
          stockDate,
          metal,
          openingWeight: numericFieldToNumber(form.openingWeight),
        })
        if (form.salesOverride !== '') {
          if (!form.overrideReason.trim()) {
            setError('Sales override requires a reason')
            setSaving(false)
            return
          }
          await api.upsertItemStock({
            stockDate,
            metal,
            itemName: name,
            salesOverride: numericFieldToNumber(form.salesOverride),
            overrideReason: form.overrideReason.trim(),
          })
        }
        showToast('Category added', 'success')
        closeCategoryModal()
      } else if (selectedRow) {
        let itemName = selectedRow.itemName
        if (name !== selectedRow.itemName) {
          await api.updateStockCategory({
            currentName: selectedRow.itemName,
            newName: name,
          })
          itemName = name
        }
        if (form.salesOverride !== '' && !form.overrideReason.trim()) {
          setError('Sales override requires a reason')
          setSaving(false)
          return
        }
        await api.upsertItemStock({
          stockDate,
          metal,
          itemName,
          openingWeight: numericFieldToNumber(form.openingWeight),
          salesOverride: form.salesOverride === '' ? null : numericFieldToNumber(form.salesOverride),
          overrideReason: form.salesOverride === '' ? undefined : form.overrideReason.trim(),
        })
        showToast('Category updated', 'success')
        closeCategoryModal()
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function autoCalculateSales() {
    if (dayClosed) {
      setError('This metal day is closed.')
      return
    }
    setSaving(true)
    try {
      setError(null)
      await api.clearStockSalesOverrides({ stockDate, metal })
      showToast('Sales overrides cleared', 'success')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear overrides')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteName) return
    setSaving(true)
    try {
      await api.deleteStockCategory(deleteName)
      setDeleteName(null)
      showToast('Category deleted', 'success')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category')
    } finally {
      setSaving(false)
    }
  }

  async function openDrill(itemName: string, kind: StockDayLineKind) {
    try {
      const lines = await api.listStockDayLines({ stockDate, metal, itemName, kind })
      setDrill({ itemName, kind, lines })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load day lines')
    }
  }

  async function openCloseDialog() {
    setCloseOpen(true)
    setPrecheckLoading(true)
    try {
      setPrecheck(await api.getDayClosePrecheck(stockDate, metal))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check open work')
      setPrecheck(null)
    } finally {
      setPrecheckLoading(false)
    }
  }

  const closeBlocked = (precheck?.openDrafts ?? 0) > 0 || (precheck?.openInwards ?? 0) > 0

  async function closeDay() {
    if (closeBlocked) return
    setSaving(true)
    try {
      setError(null)
      const sheet = await api.closeMetalDay({
        businessDate: stockDate,
        metal,
        operatorName: user?.username ?? 'operator',
        note: closeNote,
      })
      if (metal === 'Gold') setGoldSheet(sheet)
      else setSilverSheet(sheet)
      setCloseOpen(false)
      setCloseNote('')
      setPrecheck(null)
      if (sheet.backupSaved) {
        showToast(`${metal} day closed and backed up`, 'success')
      } else {
        showToast(`${metal} day closed. Backup failed — check Settings > Backup`, 'error')
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close day')
    } finally {
      setSaving(false)
    }
  }

  async function reopenDay() {
    if (!reopenReason.trim()) {
      setError('Reopen reason is required')
      return
    }
    setSaving(true)
    try {
      setError(null)
      const sheet = await api.reopenMetalDay({
        businessDate: stockDate,
        metal,
        reason: reopenReason.trim(),
      })
      if (metal === 'Gold') setGoldSheet(sheet)
      else setSilverSheet(sheet)
      setReopenOpen(false)
      setReopenReason('')
      showToast(`${metal} day reopened`, 'success')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen day')
    } finally {
      setSaving(false)
    }
  }

  function openHistoryDate(date: string) {
    setStockDate(date)
    setTab('category')
  }

  const summary = metal === 'Gold' ? goldSummary : silverSummary

  return (
    <div className={`app-page stock-page app-page-fill ${metal === 'Gold' ? 'stock-page-gold' : 'stock-page-silver'}`}>
      <div className="stock-page-header-wrap">
        <div className="stock-page-hero-icon" aria-hidden>
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M26 12L38 18L26 24L14 18L26 12Z" fill="url(#goldTop)" />
            <path d="M14 18V26L26 32V24L14 18Z" fill="url(#goldLeft)" />
            <path d="M38 18V26L26 32V24L38 18Z" fill="url(#goldRight)" />
            <path d="M16 22L28 28L16 34L4 28L16 22Z" fill="url(#goldTop)" />
            <path d="M4 28V36L16 42V34L4 28Z" fill="url(#goldLeft)" />
            <path d="M28 28V36L16 42V34L28 28Z" fill="url(#goldRight)" />
            <path d="M36 22L48 28L36 34L24 28L36 22Z" fill="url(#goldTop)" />
            <path d="M24 28V36L36 42V34L24 28Z" fill="url(#goldLeft)" />
            <path d="M48 28V36L36 42V34L48 28Z" fill="url(#goldRight)" />
            <defs>
              <linearGradient id="goldTop" x1="26" y1="12" x2="26" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FDE68A" />
                <stop offset="1" stopColor="#F59E0B" />
              </linearGradient>
              <linearGradient id="goldLeft" x1="20" y1="18" x2="20" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D97706" />
                <stop offset="1" stopColor="#92400E" />
              </linearGradient>
              <linearGradient id="goldRight" x1="32" y1="18" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#F59E0B" />
                <stop offset="1" stopColor="#B45309" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <PageHeader
          title="Gold & Silver Stock"
          subtitle="Track opening, inward, sales and closing stock"
          actions={
            <>
              <DateInput
                showIcon
                value={stockDate}
                onChange={setStockDate}
                ariaLabel="Stock date"
                className="stock-date-field"
              />
              <span className={`badge ${dayClosed ? 'final' : 'draft'}`}>
                {dayClosed ? 'Closed' : 'Open'}
              </span>
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  setPrintTarget({
                    title: 'Print preview',
                    path: printPreviewPaths.metalDay(stockDate, metal),
                  })
                }
              >
                <Printer size={16} aria-hidden />
                Print
              </button>
              {dayClosed ? (
                isAdmin ? (
                  <button type="button" className="btn secondary" disabled={saving} onClick={() => setReopenOpen(true)}>
                    <Unlock size={16} aria-hidden />
                    Reopen day
                  </button>
                ) : null
              ) : (
                <button type="button" className="btn" disabled={saving} onClick={() => void openCloseDialog()}>
                  <Lock size={16} aria-hidden />
                  Close Day
                </button>
              )}
            </>
          }
        />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="stock-summary-pair">
        <div className={`stock-metal-card stock-metal-card-gold${metal === 'Gold' ? ' active' : ''}`}>
          <div className="stock-metal-card-head">
            <span>
              <MetalBarIcon metal="gold" />
              Gold Stock Summary
            </span>
            <button type="button" className="btn ghost view-details" onClick={() => setMetal('Gold')}>
              View Details <ChevronRight size={14} aria-hidden />
            </button>
          </div>
          <dl>
            <div>
              <dt>Opening</dt>
              <dd className="num">{formatWeight(goldSummary.opening)}</dd>
            </div>
            <div>
              <dt>Inward</dt>
              <dd className="num stock-qty in">{formatWeight(goldSummary.inward)}</dd>
            </div>
            <div>
              <dt>Sales</dt>
              <dd className="num dashboard-metal-sold">{formatWeight(goldSummary.sold)}</dd>
            </div>
            <div>
              <dt>Closing</dt>
              <dd className="num">{formatWeight(goldSummary.closing)}</dd>
            </div>
          </dl>
        </div>
        <div className={`stock-metal-card stock-metal-card-silver${metal === 'Silver' ? ' active' : ''}`}>
          <div className="stock-metal-card-head">
            <span>
              <MetalBarIcon metal="silver" />
              Silver Stock Summary
            </span>
            <button type="button" className="btn ghost view-details" onClick={() => setMetal('Silver')}>
              View Details <ChevronRight size={14} aria-hidden />
            </button>
          </div>
          <dl>
            <div>
              <dt>Opening</dt>
              <dd className="num">{formatWeight(silverSummary.opening)}</dd>
            </div>
            <div>
              <dt>Inward</dt>
              <dd className="num stock-qty in">{formatWeight(silverSummary.inward)}</dd>
            </div>
            <div>
              <dt>Sales</dt>
              <dd className="num dashboard-metal-sold">{formatWeight(silverSummary.sold)}</dd>
            </div>
            <div>
              <dt>Closing</dt>
              <dd className="num">{formatWeight(silverSummary.closing)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="stock-toolbar">
        <div className="billing-chrome stock-chrome">
          <div className="billing-chrome-tabs" role="tablist" aria-label="Stock">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'category'}
              className={`billing-chrome-tab${tab === 'category' ? ' active' : ''}`}
              onClick={() => setTab('category')}
            >
              <span className="billing-chrome-tab-icon" aria-hidden>
                <Table2 size={18} strokeWidth={1.75} />
              </span>
              <span className="billing-chrome-tab-label">Stock by Category</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'closing'}
              className={`billing-chrome-tab${tab === 'closing' ? ' active' : ''}`}
              onClick={() => setTab('closing')}
            >
              <span className="billing-chrome-tab-icon" aria-hidden>
                <ClipboardList size={18} strokeWidth={1.75} />
              </span>
              <span className="billing-chrome-tab-label">Closing Summary</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'inward'}
              className={`billing-chrome-tab${tab === 'inward' ? ' active' : ''}`}
              onClick={() => setTab('inward')}
            >
              <span className="billing-chrome-tab-icon" aria-hidden>
                <Download size={18} strokeWidth={1.75} />
              </span>
              <span className="billing-chrome-tab-label">Inward Stock</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'pieces'}
              className={`billing-chrome-tab${tab === 'pieces' ? ' active' : ''}`}
              onClick={() => setTab('pieces')}
            >
              <span className="billing-chrome-tab-icon" aria-hidden>
                <Clock size={18} strokeWidth={1.75} />
              </span>
              <span className="billing-chrome-tab-label">Pieces Today</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'history'}
              className={`billing-chrome-tab${tab === 'history' ? ' active' : ''}`}
              onClick={() => setTab('history')}
            >
              <span className="billing-chrome-tab-icon" aria-hidden>
                <History size={18} strokeWidth={1.75} />
              </span>
              <span className="billing-chrome-tab-label">Stock History</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'reconcile'}
              className={`billing-chrome-tab${tab === 'reconcile' ? ' active' : ''}`}
              onClick={() => setTab('reconcile')}
            >
              <span className="billing-chrome-tab-icon" aria-hidden>
                <Scale size={18} strokeWidth={1.75} />
              </span>
              <span className="billing-chrome-tab-label">Reconciliation</span>
            </button>
          </div>
        </div>
        <div className="stock-toolbar-actions">
          {tab === 'inward' || tab === 'pieces' || tab === 'history' ? (
            <div className="stock-metal-toggle" role="group" aria-label="Metal">
              {STOCK_METALS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`btn${metal === option ? '' : ' secondary'}`}
                  onClick={() => {
                    setMetal(option)
                    setCategoryPage(1)
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
          {tab === 'closing' ? (
            <>
              <div className="stock-metal-toggle" role="group" aria-label="Summary mode">
                <button
                  type="button"
                  className={`btn${summaryMode === 'transacted' ? '' : ' secondary'}`}
                  onClick={() => setSummaryMode('transacted')}
                >
                  Transacted
                </button>
                <button
                  type="button"
                  className={`btn${summaryMode === 'all' ? '' : ' secondary'}`}
                  onClick={() => setSummaryMode('all')}
                >
                  All
                </button>
              </div>
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  setPrintTarget({
                    title: 'Print preview',
                    path: printPreviewPaths.stockClosing(stockDate, summaryMode),
                  })
                }
              >
                <Printer size={16} aria-hidden />
                Print summary
              </button>
            </>
          ) : null}
          {tab === 'category' ? (
            <>
              <div className="stock-metal-toggle" role="group" aria-label="Metal">
                {STOCK_METALS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`btn${metal === option ? '' : ' secondary'}`}
                    onClick={() => {
                      setMetal(option)
                      setCategoryPage(1)
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="stock-search">
                <Search size={15} aria-hidden />
                <SearchBar
                  value={search}
                  onChange={(val) => {
                    setSearch(val)
                    setCategoryPage(1)
                  }}
                  placeholder="Search category..."
                />
              </div>
              {!dayClosed ? (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => void autoCalculateSales()}
                    disabled={saving}
                  >
                    <RefreshCw size={16} aria-hidden />
                    Auto Calculate Sales
                  </button>
                  <button type="button" className="btn" onClick={openAddCategory}>
                    <Plus size={16} aria-hidden />
                    Add Category
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {tab === 'closing' ? (
        loading ? (
          <LoadingState />
        ) : (
          <ClosingStockSummary
            date={stockDate}
            goldRows={goldRows}
            silverRows={silverRows}
            goldStatus={goldSheet?.status ?? 'open'}
            silverStatus={silverSheet?.status ?? 'open'}
            mode={summaryMode}
          />
        )
      ) : tab === 'reconcile' ? (
        <ReconciliationReport date={stockDate} />
      ) : tab === 'history' ? (
        historyLoading ? (
          <LoadingState />
        ) : historyRows.length === 0 ? (
          <EmptyState
            title="No stock history yet"
            description="Saved openings, inwards, and finalized sales will appear here by date."
          />
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Opening</th>
                  <th className="num">Inward</th>
                  <th className="num">Sales</th>
                  <th className="num">Closing</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={row.stockDate}>
                    <td>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => openHistoryDate(row.stockDate)}
                      >
                        {formatDisplayDate(row.stockDate)}
                      </button>
                    </td>
                    <td className="num">{formatWeight(row.openingWeight)}</td>
                    <td className="num stock-qty in">{formatWeight(row.inwardWeight)}</td>
                    <td className="num dashboard-metal-sold">{formatWeight(row.salesWeight)}</td>
                    <td className="num">{formatWeight(row.closingWeight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'inward' ? (
        inwardsLoading ? (
          <LoadingState />
        ) : filteredInwards.length === 0 ? (
          <EmptyState
            title="No inward stock"
            description="No inward stock for this date and metal."
          />
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>DATE & TIME</th>
                  <th>INWARD NO</th>
                  <th>SUPPLIER</th>
                  <th>NOTES</th>
                  <th className="num">TOTAL WEIGHT (G)</th>
                  <th className="num">TOTAL AMOUNT (₹)</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredInwards.map((row) => {
                  const totalWeight = row.items.reduce(
                    (sum, item) => sum + item.netWeight * item.qty,
                    0,
                  )
                  const expanded = expandedInwardId === row.id
                  const stampedAt = row.finalizedAt ?? row.createdAt
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={expanded ? 'is-selected' : undefined}
                        onClick={() => setExpandedInwardId(expanded ? null : row.id)}
                      >
                        <td>
                          <ChevronRight
                            size={14}
                            aria-hidden
                            className={`stock-inward-chevron${expanded ? ' open' : ''}`}
                          />
                        </td>
                        <td>{formatDisplayDateTime(stampedAt)}</td>
                        <td>{row.inwardNo}</td>
                        <td>{row.supplierName}</td>
                        <td className="stock-inward-notes">{(row.notes ?? '').trim() || '—'}</td>
                        <td className="num stock-qty in">{formatWeight(totalWeight)}</td>
                        <td className="num">{formatCurrency(row.total)}</td>
                        <td>
                          <span className={`badge ${row.status === 'final' ? 'final' : 'draft'}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="stock-inward-detail-row">
                          <td colSpan={8}>
                            <table className="stock-inward-lines">
                              <thead>
                                <tr>
                                  <th>Product</th>
                                  <th>Metal</th>
                                  <th>Category</th>
                                  <th>Purity</th>
                                  <th className="num">Qty</th>
                                  <th className="num">Net wt</th>
                                  <th className="num">Rate</th>
                                  <th className="num">Line</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.items.map((item) => (
                                  <tr key={item.id}>
                                    <td>{item.productName || 'Weight only'}</td>
                                    <td>{item.metal}</td>
                                    <td>{item.category || '—'}</td>
                                    <td>{item.purity || '—'}</td>
                                    <td className="num">{item.qty}</td>
                                    <td className="num">{formatWeight(item.netWeight)}</td>
                                    <td className="num">{formatCurrency(item.rate)}</td>
                                    <td className="num">{formatCurrency(item.lineTotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'pieces' ? (
        pieceRows.length === 0 ? (
          <EmptyState
            title="No piece movements"
            description="Finalized inwards and sales with linked products will show In / Out / Net here."
          />
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">In</th>
                  <th className="num">Out</th>
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {pieceRows.map((row) => (
                  <tr key={row.productId}>
                    <td>{row.productName}</td>
                    <td className="num stock-qty in">{row.qtyIn}</td>
                    <td className="num dashboard-metal-sold">{row.qtyOut}</td>
                    <td className={`num ${row.netQty >= 0 ? 'stock-qty in' : 'dashboard-metal-sold'}`}>
                      {row.netQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="padded muted">
              {metal} totals — opening {formatWeight(summary.opening)}, inward{' '}
              <span className="stock-qty in">{formatWeight(summary.inward)}</span>, sales{' '}
              <span className="dashboard-metal-sold">{formatWeight(summary.sold)}</span>, closing{' '}
              {formatWeight(summary.closing)}.
            </p>
          </div>
        )
      ) : loading ? (
        <LoadingState />
      ) : (
        <div className="card table-wrap">
            {filteredRows.length === 0 ? (
              <EmptyState
                title="No categories"
                description={search ? 'No category matches your search.' : 'Add a category to start tracking weight.'}
                action={
                  !dayClosed && !search ? (
                    <button type="button" className="btn" onClick={openAddCategory}>
                      <Plus size={16} aria-hidden />
                      Add Category
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>CATEGORY</th>
                    <th className="num">OPENING (G)</th>
                    <th className="num">INWARD (G)</th>
                    <th className="num">SALES (G)</th>
                    <th className="num">CLOSING (G)</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, index) => {
                    const rowNumber = (categoryPage - 1) * CATEGORY_PAGE_SIZE + index + 1
                    return (
                    <tr key={row.itemName}>
                      <td className="muted">{String(rowNumber).padStart(2, '0')}</td>
                      <td>
                        <div className="stock-category-name">
                          <span className={`stock-category-icon ${getCategoryIconClass(row.itemName)}`} aria-hidden><CategoryIcon name={row.itemName} /></span>
                          {row.itemName}
                        </div>
                      </td>
                      <td className="num">{formatStockNumber(row.openingWeight)}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn ghost num stock-qty in"
                          onClick={() => {
                            void openDrill(row.itemName, 'inward')
                          }}
                        >
                          {formatStockNumber(row.autoPurchaseIn)}
                        </button>
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn ghost num dashboard-metal-sold"
                          onClick={() => {
                            void openDrill(row.itemName, 'sales')
                          }}
                        >
                          {formatStockNumber(row.effectiveSales)}
                        </button>
                      </td>
                      <td className="num">{formatStockNumber(row.closingWeight)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn ghost icon-btn"
                            aria-label={`Edit ${row.itemName}`}
                            disabled={dayClosed}
                            onClick={() => openEditCategory(row)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn ghost icon-btn stock-delete-btn"
                            aria-label={`Delete ${row.itemName}`}
                            disabled={dayClosed}
                            onClick={() => setDeleteName(row.itemName)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            )}
            {filteredRows.length > 0 ? (
              <div className="stock-pagination">
                <span className="muted">
                  Showing {(categoryPage - 1) * CATEGORY_PAGE_SIZE + 1} to {Math.min(categoryPage * CATEGORY_PAGE_SIZE, filteredRows.length)} of {filteredRows.length} categories
                </span>
                <div className="stock-pagination-controls">
                  <button type="button" className="btn ghost icon-btn" disabled={categoryPage === 1} onClick={() => setCategoryPage(p => p - 1)}><ChevronLeft size={15} aria-hidden /></button>
                  <span className="stock-page-num">{categoryPage}</span>
                  <button type="button" className="btn ghost icon-btn" disabled={categoryPage * CATEGORY_PAGE_SIZE >= filteredRows.length} onClick={() => setCategoryPage(p => p + 1)}><ChevronRight size={15} aria-hidden /></button>
                </div>
              </div>
            ) : null}
        </div>
      )}

      {panelMode ? (
        <CategoryFormModal
          mode={panelMode}
          form={form}
          setForm={setForm}
          preview={{ inward: previewInward, sales: previewSales, closing: previewClosing }}
          dayClosed={dayClosed}
          saving={saving}
          onClose={closeCategoryModal}
          onSave={() => void savePanel()}
        />
      ) : null}

      {deleteName != null ? (
        <DeleteCategoryModal
          categoryName={deleteName}
          onCancel={() => setDeleteName(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {drill != null ? (
        <Modal
          title={`${drill.kind === 'inward' ? 'Inward' : 'Sales'} — ${drill.itemName}`}
          onClose={() => setDrill(null)}
          footer={
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setDrill(null)}>
                Close
              </button>
            </div>
          }
        >
          {drill.lines.length === 0 ? (
            <p className="muted">No documents for this cell.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Date</th>
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.lines.map((line, index) => (
                    <tr key={`${line.documentId}-${index}`}>
                      <td>
                        {line.kind === 'inward' ? (
                          line.documentNo
                        ) : (
                          <Link to={`/billing/cash/${line.documentId}`} onClick={() => setDrill(null)}>
                            {line.documentNo}
                          </Link>
                        )}
                      </td>
                      <td>{formatDisplayDate(line.documentDate)}</td>
                      <td>{line.productName || '—'}</td>
                      <td className="num">{line.qty}</td>
                      <td className="num">{formatWeight(line.weightTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      ) : null}

      {closeOpen ? (
        <Modal
          title={`Close ${metal} day — ${formatDisplayDate(stockDate)}`}
          onClose={() => {
            setCloseOpen(false)
            setPrecheck(null)
          }}
          footer={
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setCloseOpen(false)
                  setPrecheck(null)
                }}
              >
                Cancel
              </button>
              {closeBlocked ? (
                (precheck?.openDrafts ?? 0) > 0 ? (
                  <Link to="/billing" className="btn secondary" onClick={() => setCloseOpen(false)}>
                    Go to Billing
                  </Link>
                ) : null
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={saving || precheckLoading}
                  onClick={() => void closeDay()}
                >
                  Close day
                </button>
              )}
            </div>
          }
        >
          <p>
            Snapshot opening, inward, sales, and closing for each category. Finalizing bills or
            inwards for this metal/date will be blocked until an admin reopens the day.
          </p>
          {precheckLoading ? (
            <p className="muted">Checking open drafts and inwards…</p>
          ) : precheck ? (
            <p className={closeBlocked ? 'error-banner' : 'muted'}>
              {closeBlocked
                ? `Cannot close: ${precheck.openDrafts} open draft bills and ${precheck.openInwards} open inwards for ${metal} on this date. Finalize or delete them first.`
                : `Ready to close. ${precheck.unpaidDues} due entries dated today (informational).`}
            </p>
          ) : null}
          <label>
            Note (optional)
            <textarea
              className="input"
              rows={2}
              value={closeNote}
              onChange={(event) => setCloseNote(event.target.value)}
            />
          </label>
        </Modal>
      ) : null}

      {reopenOpen ? (
        <Modal
          title={`Reopen ${metal} day — ${formatDisplayDate(stockDate)}`}
          onClose={() => setReopenOpen(false)}
          footer={
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setReopenOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={saving || !reopenReason.trim()}
                onClick={() => void reopenDay()}
              >
                Reopen day
              </button>
            </div>
          }
        >
          <p>Reopening deletes the snapshot so the ledger recomputes from live bills and inwards.</p>
          <label>
            Reason
            <textarea
              className="input"
              rows={2}
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
            />
          </label>
        </Modal>
      ) : null}
      {printTarget ? (
        <PrintPreviewModal
          title={printTarget.title}
          path={printTarget.path}
          pdfFilename="stock-report.pdf"
          onClose={() => setPrintTarget(null)}
        />
      ) : null}
    </div>
  )
}
