import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Banknote,
  Calendar,
  ChevronDown,
  Coins,
  FileEdit,
  IndianRupee,
  Package,
  Plus,
  RefreshCw,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { STOCK_METALS } from '@shared/itemTypes'
import { localTodayIso } from '@shared/localDate'
import type {
  DuesLedger,
  GoldSavingDashboard,
  Invoice,
  InvoiceListStats,
  ItemStockRow,
  MetalRates,
  StockReconciliationRow,
} from '@shared/types'
import { formatCurrency, formatDisplayDate, formatInr, formatPaymentMode, formatWeight } from '../../lib/format'
import { api } from '../../lib/api'
import { useAuth } from '../auth/authContext'
import { CategoryStockCard } from './CategoryStockCard'
import { DashboardAlertsMenu } from './DashboardAlertsMenu'
import {
  applyInvoiceStats,
  buildDashboardAlerts,
  periodGranularity,
  RECENT_BILLS_LIMIT,
  resolvePeriodRange,
  type DashboardStats,
  type OldGoldTodayStats,
} from './dashboardStats'

function formatDashboardDate(isoDate: string): string {
  const formatted = formatDisplayDate(isoDate)
  if (isoDate === localTodayIso()) {
    return `Today, ${formatted}`
  }
  return formatted
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

type KpiTone = 'brand' | 'success' | 'danger' | 'info'

function KpiSparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return null
  }
  const max = Math.max(...values, 1)
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100
      const y = 22 - (value / max) * 20
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg className="dashboard-kpi-sparkline" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function KpiCard({
  to,
  label,
  value,
  hint,
  icon: Icon,
  tone,
  sparkline,
}: {
  to?: string
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  tone: KpiTone
  sparkline?: number[]
}) {
  const body = (
    <>
      <div className={`dashboard-kpi-icon dashboard-kpi-icon-${tone}`}>
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </div>
      <div className="dashboard-kpi-body">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value num">{value}</span>
        {hint ? <span className="dashboard-kpi-hint">{hint}</span> : null}
      </div>
      {sparkline ? <KpiSparkline values={sparkline} /> : null}
    </>
  )

  if (to) {
    return (
      <Link to={to} className="card padded dashboard-kpi-card dashboard-kpi-card-link">
        {body}
      </Link>
    )
  }

  return <div className="card padded dashboard-kpi-card">{body}</div>
}

type GoldKarat = '22k' | '24k'

function formatRateAmount(amount: number | undefined): string {
  if (amount == null) return '—'
  return formatCurrency(amount)
}

function RateTicker({
  metal,
  label,
  amount,
  chevron,
  expanded,
  onClick,
}: {
  metal: 'gold' | 'silver'
  label: string
  amount: string
  chevron?: boolean
  expanded?: boolean
  onClick?: () => void
}) {
  const className = `dashboard-rate-ticker dashboard-rate-ticker-${metal}`
  const body = (
    <>
      <span className="dashboard-rate-coin" aria-hidden />
      <span className="dashboard-rate-text">
        {label} - {amount}
      </span>
      {chevron ? <ChevronDown size={14} strokeWidth={2} aria-hidden /> : null}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        aria-expanded={expanded}
        aria-haspopup="listbox"
        onClick={onClick}
      >
        {body}
      </button>
    )
  }

  return <span className={className}>{body}</span>
}

function GoldRateTicker({ rates }: { rates: MetalRates | null }) {
  const [karat, setKarat] = useState<GoldKarat>('22k')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const amount = karat === '24k' ? rates?.gold24k : rates?.gold22k
  const label = karat === '24k' ? 'GOLD24 KT/1g' : 'GOLD22 KT/1g'

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="dashboard-rate-ticker-wrap" ref={rootRef}>
      <RateTicker
        metal="gold"
        label={label}
        amount={formatRateAmount(amount)}
        chevron
        expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div className="dashboard-rate-menu" role="listbox" aria-label="Gold rates">
          <button
            type="button"
            role="option"
            aria-selected={karat === '22k'}
            onClick={() => {
              setKarat('22k')
              setOpen(false)
            }}
          >
            <span>Gold 22K</span>
            <span className="num">{formatRateAmount(rates?.gold22k)}</span>
          </button>
          <button
            type="button"
            role="option"
            aria-selected={karat === '24k'}
            onClick={() => {
              setKarat('24k')
              setOpen(false)
            }}
          >
            <span>Gold 24K</span>
            <span className="num">{formatRateAmount(rates?.gold24k)}</span>
          </button>
          {rates ? null : (
            <Link to="/settings" className="dashboard-rate-menu-link" onClick={() => setOpen(false)}>
              Set rates in Settings
            </Link>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function DashboardPage() {
  if (window.location.hash.includes('crash-test')) {
    throw new Error('Diagnostic crash test')
  }

  const { user, can } = useAuth()
  const displayName = user?.username || 'Shop Owner'
  const avatarLetter = displayName.charAt(0).toUpperCase()
  const [invoiceStats, setInvoiceStats] = useState<InvoiceListStats | null>(null)
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([])
  const [ledger, setLedger] = useState<DuesLedger | undefined>(undefined)
  const [goldStock, setGoldStock] = useState<ItemStockRow[]>([])
  const [silverStock, setSilverStock] = useState<ItemStockRow[]>([])
  const [metalRates, setMetalRates] = useState<MetalRates | null>(null)
  const [reconciliation, setReconciliation] = useState<StockReconciliationRow[] | null>(null)
  const [goldSavings, setGoldSavings] = useState<GoldSavingDashboard | null>(null)
  const [oldGoldStats, setOldGoldStats] = useState<OldGoldTodayStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedRef = useRef(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const today = localTodayIso()
  const greeting = greetingForHour(new Date().getHours())
  const range = resolvePeriodRange('today', today, today, today)
  const granularity = periodGranularity('today', range)
  const emptyStats: InvoiceListStats = {
    sales: 0,
    collections: 0,
    draftCount: 0,
    billsGenerated: 0,
    customersBilled: 0,
    totalItemsSold: 0,
    chart: [],
    collectionsChart: [],
  }
  const stats: DashboardStats = applyInvoiceStats(
    invoiceStats ?? emptyStats,
    recentInvoices,
    ledger,
    goldStock,
    silverStock,
    today,
    { period: 'today', customFrom: today, customTo: today },
    oldGoldStats,
  )

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (active) {
          setError(null)
          if (hasLoadedRef.current) setRefreshing(true)
          else setLoading(true)
        }
        const [
          statsPayload,
          recentPage,
          dues,
          goldRows,
          silverRows,
          latestRates,
          reconRows,
          gsDashboard,
          oldGoldPayload,
        ] = await Promise.all([
            api.getInvoiceStats({ from: range.from, to: range.to, granularity }).catch(() => emptyStats),
            api.listInvoices({ page: 1, pageSize: RECENT_BILLS_LIMIT, sort: 'desc' }).catch(() => ({
              items: [] as Invoice[],
              total: 0,
              page: 1,
              pageSize: RECENT_BILLS_LIMIT,
            })),
            api.listDues().catch(() => undefined),
            api.listItemStock({ stockDate: today, metal: STOCK_METALS[0] }).catch(() => [] as ItemStockRow[]),
            api.listItemStock({ stockDate: today, metal: STOCK_METALS[1] }).catch(() => [] as ItemStockRow[]),
            api.getLatestMetalRates().catch(() => null),
            can('stock') ? api.getStockReconciliation(today).catch(() => null) : Promise.resolve(null),
            can('gold_savings') ? api.getGsDashboard().catch(() => null) : Promise.resolve(null),
            api.getOldGoldPurchaseStats(today).catch(() => null),
          ])
        if (active) {
          setInvoiceStats(statsPayload ?? emptyStats)
          setRecentInvoices(recentPage.items ?? [])
          setLedger(dues)
          setGoldStock(goldRows)
          setSilverStock(silverRows)
          setMetalRates(latestRates)
          setReconciliation(reconRows)
          setGoldSavings(gsDashboard)
          setOldGoldStats(oldGoldPayload)
          hasLoadedRef.current = true
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard')
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
  }, [today, refreshKey, range.from, range.to, granularity, can])

  const recentBills = stats.recentBills ?? []
  const sales = stats.salesOverview
  const outstandingHint =
    stats.outstandingCustomerCount > 0
      ? `${stats.outstandingCustomerCount} customer${stats.outstandingCustomerCount === 1 ? '' : 's'}`
      : undefined
  const draftHint = stats.draftCount > 0 ? 'Needs attention' : undefined
  const oldGold = stats.oldGoldToday
  const oldGoldHint =
    oldGold.count > 0
      ? `${formatWeight(oldGold.netWeight)} · open ₹ ${formatInr(oldGold.openBalance)}`
      : undefined
  const salesSparkline = sales.hourlyTotals
  const collectionsSparkline = sales.collectionTotals
  const alerts = buildDashboardAlerts(ledger, reconciliation, goldSavings, today)

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-greeting">{greeting}, {displayName}</p>
        </div>
        <div className="dashboard-header-tools">
          <GoldRateTicker rates={metalRates} />
          <RateTicker
            metal="silver"
            label="SILVER/1g"
            amount={formatRateAmount(metalRates?.silverFine)}
          />
          <span className="dashboard-date-chip">
            <Calendar size={15} strokeWidth={1.75} aria-hidden />
            {formatDashboardDate(today)}
          </span>
          <button
            type="button"
            className="btn ghost dashboard-icon-btn"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading || refreshing}
            aria-label="Refresh dashboard"
          >
            <RefreshCw
              size={18}
              strokeWidth={1.75}
              className={loading || refreshing ? 'dashboard-spin' : ''}
            />
          </button>
          <DashboardAlertsMenu alerts={alerts} />
          <div className="dashboard-profile">
            <span className="dashboard-avatar" aria-hidden>{avatarLetter}</span>
            <span className="dashboard-profile-name">{displayName}</span>
          </div>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {loading && !error ? (
        <p className="muted">Loading…</p>
      ) : error ? (
        <p className="muted">Fix the error above and reload the page (View → Reload).</p>
      ) : (
        <>
          <div className="dashboard-kpi-grid">
            <KpiCard
              label="Today's sales"
              value={`₹ ${formatInr(stats.todaySales)}`}
              icon={IndianRupee}
              tone="brand"
              sparkline={salesSparkline}
            />
            <KpiCard
              label="Today's collections"
              value={`₹ ${formatInr(stats.todayCollections)}`}
              icon={Banknote}
              tone="success"
              sparkline={collectionsSparkline}
            />
            <KpiCard
              to="/dues"
              label="Outstanding"
              value={`₹ ${formatInr(stats.totalOutstanding)}`}
              hint={outstandingHint}
              icon={Wallet}
              tone="danger"
            />
            <KpiCard
              to="/billing"
              label="Draft bills"
              value={String(stats.draftCount)}
              hint={draftHint}
              icon={FileEdit}
              tone="info"
            />
            <KpiCard
              to="/inventory/old-gold"
              label="Old gold bought"
              value={`₹ ${formatInr(oldGold.amount)}`}
              hint={oldGoldHint}
              icon={Coins}
              tone="brand"
            />
          </div>

          <CategoryStockCard
            goldRows={goldStock}
            silverRows={silverStock}
            dateLabel={formatDashboardDate(today)}
          />

          <section className="dashboard-quick-section" aria-label="Quick actions">
            <h2 className="dashboard-quick-title">
              <Zap size={18} strokeWidth={1.75} aria-hidden />
              Quick actions
            </h2>
            <div className="dashboard-quick-actions">
              <Link to="/billing/cash/new" className="btn dashboard-quick-primary">
                <Plus size={18} strokeWidth={2} aria-hidden />
                New bill
              </Link>
              <Link to="/customers" className="btn secondary dashboard-quick-btn">
                <Users size={18} strokeWidth={1.75} aria-hidden />
                Customers
              </Link>
              <Link to="/inventory/products" className="btn secondary dashboard-quick-btn">
                <Package size={18} strokeWidth={1.75} aria-hidden />
                Products
              </Link>
              <Link to="/dues" className="btn secondary dashboard-quick-btn">
                <UserPlus size={18} strokeWidth={1.75} aria-hidden />
                Record payment
              </Link>
            </div>
          </section>

          <div className="dashboard-lower-grid">
            <section>
              <div className="dashboard-section-head">
                <h2 className="dashboard-section-title">Recent bills</h2>
                <Link to="/billing" className="dashboard-panel-link">View all</Link>
              </div>
              {recentBills.length === 0 ? (
                <div className="card padded dashboard-empty-state">No bills yet.</div>
              ) : (
                <div className="card table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Bill #</th>
                        <th>Customer</th>
                        <th>Date</th>
                        <th className="num">Amount</th>
                        <th>Payment</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentBills.map((invoice) => (
                        <tr key={invoice.id}>
                          <td>
                            <Link
                              to={
                                invoice.billFormat === 'tax_invoice'
                                  ? `/billing/tax/${invoice.id}`
                                  : `/billing/cash/${invoice.id}`
                              }
                            >
                              {invoice.invoiceNo}
                            </Link>
                          </td>
                          <td>{invoice.customerName}</td>
                          <td>{formatDisplayDate(invoice.invoiceDate)}</td>
                          <td className="num">{formatCurrency(invoice.total)}</td>
                          <td>{formatPaymentMode(invoice.paymentMode)}</td>
                          <td>
                            {invoice.status === 'draft' ? (
                              <span className="badge draft">Draft</span>
                            ) : invoice.balanceDue > 0 ? (
                              <span className="badge due">Due</span>
                            ) : (
                              <span className="badge final">Final</span>
                            )}
                            {invoice.isEstimate === true && (
                              <span className="badge draft"> estimate</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <div className="dashboard-section-head">
                <h2 className="dashboard-section-title">Due collections</h2>
                <Link to="/dues" className="dashboard-panel-link">View all</Link>
              </div>
              {stats.dueCollections.length === 0 ? (
                <div className="card padded dashboard-empty-state">No outstanding balances.</div>
              ) : (
                <div className="card table-wrap dashboard-due-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th className="num">Amount</th>
                        <th className="num">Days</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.dueCollections.map((row) => (
                        <tr key={row.customerId}>
                          <td>{row.customerName}</td>
                          <td className="num dashboard-due-amount">₹ {formatInr(row.balance)}</td>
                          <td className="num dashboard-due-days">{row.daysOverdue}</td>
                          <td>
                            <Link to="/dues" className="btn secondary dashboard-due-collect">
                              Collect
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
