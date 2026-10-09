import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Banknote,
  Calendar,
  ChevronDown,
  Coins,
  FileEdit,
  FileText,
  IndianRupee,
  Package,
  Plus,
  RefreshCw,
  ShoppingBag,
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
import { FilterBar } from '../../components/FilterBar'
import { DateInput } from '../../components/DateInput'
import { MetalBarIcon } from '../../components/MetalBarIcon'
import { formatCurrency, formatDisplayDate, formatInr, formatPaymentMode, formatWeight } from '../../lib/format'
import { api } from '../../lib/api'
import { useAuth } from '../auth/authContext'
import { DashboardAlertsMenu } from './DashboardAlertsMenu'
import {
  applyInvoiceStats,
  buildDashboardAlerts,
  periodGranularity,
  RECENT_BILLS_LIMIT,
  resolvePeriodRange,
  type ChartGranularity,
  type DashboardPeriod,
  type DashboardStats,
  type OldGoldTodayStats,
  type SalesChartBucket,
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

const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

function periodSalesLabel(period: DashboardPeriod): string {
  if (period === 'week') return "This week's sales"
  if (period === 'month') return "This month's sales"
  if (period === 'year') return "This year's sales"
  if (period === 'custom') return 'Custom range sales'
  return "Today's sales"
}

function periodCollectionsLabel(period: DashboardPeriod): string {
  if (period === 'week') return "This week's collections"
  if (period === 'month') return "This month's collections"
  if (period === 'year') return "This year's collections"
  if (period === 'custom') return 'Custom range collections'
  return "Today's collections"
}

function chartCaption(granularity: ChartGranularity): string {
  if (granularity === 'hour') return 'Today by hour'
  if (granularity === 'month') return 'By month'
  return 'By day'
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
      const y = 100 - (value / max) * 100
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

function SalesOverviewChart({ buckets }: { buckets: SalesChartBucket[] }) {
  const max = Math.max(...buckets.map((bucket) => bucket.total), 1)
  const dense = buckets.length > 14

  return (
    <div className="dashboard-sales-chart" role="img" aria-label="Sales for selected period">
      <div className={`dashboard-sales-bars${dense ? ' dense' : ''}`}>
        {buckets.map((bucket) => {
          const heightPct = (bucket.total / max) * 100
          return (
            <div key={bucket.key} className="dashboard-sales-bar-col">
              <div className="dashboard-sales-bar-track">
                <div
                  className="dashboard-sales-bar-fill"
                  style={{ height: `${heightPct}%` }}
                  title={`${bucket.label}: ₹${formatInr(bucket.total)}`}
                />
              </div>
              <span className="dashboard-sales-bar-label">{bucket.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
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

function MetalStockBlock({
  title,
  metal,
  summary,
  closingLabel,
}: {
  title: string
  metal: 'gold' | 'silver'
  summary: { opening: number; inward: number; sold: number; closing: number }
  closingLabel: string
}) {
  return (
    <div className="dashboard-metal-block">
      <div className="dashboard-metal-head">
        <h3 className="dashboard-metal-title">
          <MetalBarIcon metal={metal} />
          {title}
        </h3>
        <Link to="/inventory/stock" className="dashboard-panel-link">View stock</Link>
      </div>
      <dl className="dashboard-metal-stats">
        <div>
          <dt>Opening today</dt>
          <dd className="num">{formatWeight(summary.opening)}</dd>
        </div>
        <div>
          <dt>Inward today</dt>
          <dd className="num stock-qty in">{formatWeight(summary.inward)}</dd>
        </div>
        <div>
          <dt>Sold today</dt>
          <dd className="num dashboard-metal-sold">{formatWeight(summary.sold)}</dd>
        </div>
        <div>
          <dt className="kpi-label">{closingLabel}</dt>
          <dd className="num dashboard-metal-closing">{formatWeight(summary.closing)}</dd>
        </div>
      </dl>
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
  const [period, setPeriod] = useState<DashboardPeriod>('today')
  const [customFrom, setCustomFrom] = useState(() => localTodayIso())
  const [customTo, setCustomTo] = useState(() => localTodayIso())

  const today = localTodayIso()
  const greeting = greetingForHour(new Date().getHours())
  const range = resolvePeriodRange(period, today, customFrom, customTo)
  const granularity = periodGranularity(period, range)
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
    { period, customFrom, customTo },
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
              label={periodSalesLabel(period)}
              value={`₹ ${formatInr(stats.todaySales)}`}
              icon={IndianRupee}
              tone="brand"
              sparkline={salesSparkline}
            />
            <KpiCard
              label={periodCollectionsLabel(period)}
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

          <div className="dashboard-mid-grid">
            <section className="card padded dashboard-panel dashboard-sales-panel">
              <div className="dashboard-sales-top">
                <div className="dashboard-sales-heading">
                  <div>
                    <h2>Sales overview</h2>
                    <p className="dashboard-sales-hero-sub muted">{periodSalesLabel(period)}</p>
                  </div>
                  <div className="dashboard-sales-top-right">
                    <p className="dashboard-sales-hero num">₹ {formatInr(stats.todaySales)}</p>
                    <span className="muted dashboard-panel-sub">{chartCaption(sales.chartGranularity)}</span>
                  </div>
                </div>
                <div className="dashboard-sales-filters">
                  <FilterBar value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
                  {period === 'custom' ? (
                    <div className="dashboard-sales-custom-range">
                      <label className="dashboard-sales-date-field">
                        From
                        <DateInput
                          className="input"
                          value={customFrom}
                          max={today}
                          ariaLabel="Custom from date"
                          onChange={setCustomFrom}
                        />
                      </label>
                      <label className="dashboard-sales-date-field">
                        To
                        <DateInput
                          className="input"
                          value={customTo}
                          max={today}
                          ariaLabel="Custom to date"
                          onChange={setCustomTo}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
              <SalesOverviewChart buckets={sales.chartBuckets} />
              <div className="dashboard-sales-footer">
                <div>
                  <FileText size={14} aria-hidden />
                  <span className="dashboard-mini-label">Bills generated</span>
                  <strong className="num">{sales.billsGenerated}</strong>
                </div>
                <div>
                  <IndianRupee size={14} aria-hidden />
                  <span className="dashboard-mini-label">Average bill value</span>
                  <strong className="num">₹ {formatInr(sales.averageBillValue)}</strong>
                </div>
                <div>
                  <Users size={14} aria-hidden />
                  <span className="dashboard-mini-label">Customers billed</span>
                  <strong className="num">{sales.customersBilled}</strong>
                </div>
                <div>
                  <ShoppingBag size={14} aria-hidden />
                  <span className="dashboard-mini-label">Total items sold</span>
                  <strong className="num">{sales.totalItemsSold}</strong>
                </div>
              </div>
            </section>

            <section className="card padded dashboard-panel dashboard-metal-panel">
              <div className="dashboard-panel-head">
                <div>
                  <h2>Metal stock</h2>
                  <p className="muted dashboard-panel-sub">
                    {formatDashboardDate(today)} · Not affected by the sales period filter
                  </p>
                </div>
              </div>
              <MetalStockBlock
                title="Gold"
                metal="gold"
                summary={stats.metalStock.gold}
                closingLabel="Gold closing"
              />
              <MetalStockBlock
                title="Silver"
                metal="silver"
                summary={stats.metalStock.silver}
                closingLabel="Silver closing"
              />
            </section>
          </div>

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
