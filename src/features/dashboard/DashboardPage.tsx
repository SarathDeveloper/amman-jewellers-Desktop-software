import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  Calendar,
  CalendarDays,
  ChevronDown,
  Clock,
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
  ItemStockRow,
  MetalRates,
  StockReconciliationRow,
} from '@shared/types'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { api } from '../../lib/api'
import { useAuth } from '../auth/authContext'
import { CategoryStockCard } from './CategoryStockCard'
import { DashboardAlertsMenu } from './DashboardAlertsMenu'
import { buildDashboardAlerts, computeDashboardStats, overdueBillDues } from './dashboardStats'

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

function KpiCard({
  to,
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  to?: string
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  tone: KpiTone
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
  const [ledger, setLedger] = useState<DuesLedger | undefined>(undefined)
  const [goldStock, setGoldStock] = useState<ItemStockRow[]>([])
  const [silverStock, setSilverStock] = useState<ItemStockRow[]>([])
  const [metalRates, setMetalRates] = useState<MetalRates | null>(null)
  const [reconciliation, setReconciliation] = useState<StockReconciliationRow[] | null>(null)
  const [goldSavings, setGoldSavings] = useState<GoldSavingDashboard | null>(null)
  const [adaguReminders, setAdaguReminders] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedRef = useRef(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const today = localTodayIso()
  const greeting = greetingForHour(new Date().getHours())
  const canSchemes = can('gold_savings')
  const stats = computeDashboardStats([], ledger, [], [], today)
  const overdue = overdueBillDues(ledger, today)
  const outstandingHint = stats.totalOutstanding > 0 ? formatCurrency(stats.totalOutstanding) : undefined
  const overdueHint = overdue.amount > 0 ? formatCurrency(overdue.amount) : undefined

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (active) {
          setError(null)
          if (hasLoadedRef.current) setRefreshing(true)
          else setLoading(true)
        }
        const [reminderCount, dues, goldRows, silverRows, latestRates, reconRows, gsDashboard] =
          await Promise.all([
            api.getUpcomingAdaguReminderCount(14).catch(() => ({ count: 0 })),
            api.listDues().catch(() => undefined),
            api.listItemStock({ stockDate: today, metal: STOCK_METALS[0] }).catch(() => [] as ItemStockRow[]),
            api.listItemStock({ stockDate: today, metal: STOCK_METALS[1] }).catch(() => [] as ItemStockRow[]),
            api.getLatestMetalRates().catch(() => null),
            can('stock') ? api.getStockReconciliation(today).catch(() => null) : Promise.resolve(null),
            canSchemes ? api.getGsDashboard().catch(() => null) : Promise.resolve(null),
          ])
        if (active) {
          setAdaguReminders(reminderCount?.count ?? 0)
          setLedger(dues)
          setGoldStock(goldRows)
          setSilverStock(silverRows)
          setMetalRates(latestRates)
          setReconciliation(reconRows)
          setGoldSavings(gsDashboard)
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
  }, [today, refreshKey, can, canSchemes])

  const alerts = buildDashboardAlerts(ledger, reconciliation, goldSavings, today)
  const schemeOverdue = goldSavings?.overdueInstallments ?? 0
  const schemeDueThisWeek = goldSavings?.dueThisWeek ?? 0

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
              to="/dues?tab=adagu&filter=reminders"
              label="Adagu reminders"
              value={String(adaguReminders)}
              hint="Next 14 days"
              icon={Bell}
              tone="brand"
            />
            <KpiCard
              to="/dues"
              label="Outstanding customers"
              value={String(stats.outstandingCustomerCount)}
              hint={outstandingHint}
              icon={Wallet}
              tone="danger"
            />
            <KpiCard
              to="/dues"
              label="Overdue bill dues"
              value={String(overdue.count)}
              hint={overdueHint}
              icon={AlertTriangle}
              tone="danger"
            />
            <KpiCard
              to={canSchemes ? '/gold-savings/overdue' : undefined}
              label="Scheme installments overdue"
              value={String(schemeOverdue)}
              icon={Clock}
              tone="danger"
            />
            <KpiCard
              to={canSchemes ? '/gold-savings/collections' : undefined}
              label="Scheme dues this week"
              value={String(schemeDueThisWeek)}
              hint="Next 7 days"
              icon={CalendarDays}
              tone="info"
            />
          </div>

          <CategoryStockCard
            goldRows={goldStock}
            silverRows={silverStock}
            dateLabel={formatDashboardDate(today)}
          />

          <section className="dashboard-quick-section" aria-label="Quick actions">
            <h2 className="dashboard-quick-title">
              <Zap size={20} strokeWidth={1.75} aria-hidden />
              Quick actions
            </h2>
            <div className="dashboard-quick-actions">
              <Link to="/billing/cash/new" className="btn dashboard-quick-primary">
                <Plus size={22} strokeWidth={2} aria-hidden />
                New bill
              </Link>
              <Link to="/customers" className="btn secondary dashboard-quick-btn">
                <Users size={22} strokeWidth={1.75} aria-hidden />
                Customers
              </Link>
              <Link to="/inventory/products" className="btn secondary dashboard-quick-btn">
                <Package size={22} strokeWidth={1.75} aria-hidden />
                Products
              </Link>
              <Link to="/dues" className="btn secondary dashboard-quick-btn">
                <UserPlus size={22} strokeWidth={1.75} aria-hidden />
                Record payment
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
