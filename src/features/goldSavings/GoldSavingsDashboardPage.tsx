import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarDays, FileText, IndianRupee, Plus, User, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { GoldSavingAccount, GoldSavingDashboard, GoldSavingPayment } from '@shared/types'
import { PageHeader } from '../../components/PageHeader'
import { LoadingState } from '../../components/LoadingState'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../lib/format'
import { api } from '../../lib/api'

type KpiTone = 'brand' | 'info' | 'success' | 'gold'

function monthProgressPct(collected: number, target: number): number {
  if (target <= 0) return collected > 0 ? 100 : 0
  return Math.round((collected / target) * 100)
}

function GoldBarsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.2 7.2 6.6h9.6L20 8.2l-3.2 1.6H7.2L4 8.2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M7.2 9.8v2.2M16.8 9.8v2.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M4 15.6 7.2 14h9.6l3.2 1.6-3.2 1.6H7.2L4 15.6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M7.2 17.2V19.4M16.8 17.2V19.4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function KpiCard({
  to,
  label,
  value,
  icon,
  tone,
}: {
  to?: string
  label: string
  value: string
  icon: ReactNode
  tone: KpiTone
}) {
  const body = (
    <>
      <span className={`gs-home-kpi-icon gs-home-kpi-icon-${tone}`}>{icon}</span>
      <span className="gs-home-kpi-body">
        <span className="gs-home-kpi-label">{label}</span>
        <span className="gs-home-kpi-value num">{value}</span>
      </span>
    </>
  )
  if (to) {
    return (
      <Link to={to} className="card padded gs-home-kpi">
        {body}
      </Link>
    )
  }
  return <div className="card padded gs-home-kpi">{body}</div>
}

function PanelEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="gs-home-empty">
      <span className="gs-home-empty-icon">
        <Icon size={22} strokeWidth={1.75} aria-hidden />
      </span>
      <p className="gs-home-empty-title">{title}</p>
      <p className="muted">{description}</p>
    </div>
  )
}

function CollectionRows({ payments }: { payments: GoldSavingPayment[] }) {
  if (payments.length === 0) return null
  return (
    <div className="gs-home-list">
      {payments.map((payment) => (
        <div key={payment.id} className="gs-home-row">
          <span className="gs-home-row-name">{payment.customerName}</span>
          <span className="muted">
            {formatDisplayDate(payment.paymentDate)} · {formatCurrency(payment.amount)}
          </span>
        </div>
      ))}
    </div>
  )
}

function MaturityRows({ accounts }: { accounts: GoldSavingAccount[] }) {
  return (
    <div className="gs-home-list">
      {accounts.map((account) => (
        <Link key={account.id} to={`/gold-savings/accounts/${account.id}`} className="gs-home-row">
          <span className="gs-home-row-name">{account.customerName}</span>
          <span className="muted">
            {account.accountNo} · {formatDisplayDate(account.maturityDate)} · {formatWeight(account.goldAccumulated, 3)}
          </span>
        </Link>
      ))}
    </div>
  )
}

export function GoldSavingsDashboardPage() {
  const [data, setData] = useState<GoldSavingDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void api
      .getGsDashboard()
      .then((next) => {
        if (active) setData(next)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="app-page gs-home">
        <LoadingState />
      </div>
    )
  }
  if (error) {
    return (
      <div className="app-page gs-home">
        <div className="error-banner">{error}</div>
      </div>
    )
  }
  if (!data) return null

  const monthPayments = data.monthPayments ?? []
  const maturingAccounts = data.maturingAccounts ?? []
  const monthPct = monthProgressPct(data.monthCollections, data.monthTarget)
  const monthBarPct = Math.min(100, monthPct)
  const collectionsEmpty = data.monthCollections === 0 && data.monthTarget === 0
  let collectionsBody: ReactNode
  if (collectionsEmpty) {
    collectionsBody = (
      <PanelEmpty
        icon={FileText}
        title="No collections yet"
        description="No installments are scheduled this month."
      />
    )
  } else {
    collectionsBody = (
      <>
        <p className="muted gs-home-progress-caption">
          {monthPct}% of scheduled installments due this month
        </p>
        <CollectionRows payments={monthPayments} />
      </>
    )
  }

  return (
    <div className="app-page gs-home">
      <PageHeader
        title="Monthly Gold Savings"
        subtitle="Scheme collections, enrollments and upcoming maturities"
        actions={
          <>
            <Link className="btn" to="/gold-savings/enroll">
              <Plus size={18} strokeWidth={2} aria-hidden />
              New Enrollment
            </Link>
            <Link className="btn secondary" to="/gold-savings/collections">
              <IndianRupee size={18} strokeWidth={1.75} aria-hidden />
              Collect Payment
            </Link>
          </>
        }
      />

      <div className="gs-home-kpis">
        <KpiCard
          to="/gold-savings/schemes"
          label="Active Schemes"
          value={String(data.activeSchemes)}
          icon={<Users size={20} strokeWidth={1.75} aria-hidden />}
          tone="brand"
        />
        <KpiCard
          to="/gold-savings/accounts"
          label="Enrolled Customers"
          value={String(data.enrolledCustomers)}
          icon={<User size={20} strokeWidth={1.75} aria-hidden />}
          tone="info"
        />
        <KpiCard
          to="/gold-savings/collections"
          label="This Month Collection"
          value={formatCurrency(data.monthCollections)}
          icon={<IndianRupee size={20} strokeWidth={1.75} aria-hidden />}
          tone="success"
        />
        <KpiCard
          label="Total Gold Accumulated"
          value={formatWeight(data.totalGold, 3)}
          icon={<GoldBarsIcon />}
          tone="gold"
        />
      </div>

      <div className="gs-home-panels">
        <section className="card gs-home-panel" aria-label="This month's collections">
          <div className="gs-home-panel-head">
            <h2>
              <span className="gs-home-panel-icon">
                <BarChart3 size={18} strokeWidth={1.75} aria-hidden />
              </span>
              This Month's Collections
            </h2>
            <span className="num gs-home-panel-meta">
              {formatCurrency(data.monthCollections)} of {formatCurrency(data.monthTarget)}
            </span>
          </div>
          <div
            className="gs-progress-track"
            role="progressbar"
            aria-valuenow={monthBarPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="This month collection progress"
          >
            <div className="gs-progress-fill" style={{ width: `${monthBarPct}%` }} />
          </div>
          {collectionsBody}
        </section>

        <section className="card gs-home-panel" aria-label="Upcoming maturities">
          <div className="gs-home-panel-head">
            <h2>
              <span className="gs-home-panel-icon">
                <CalendarDays size={18} strokeWidth={1.75} aria-hidden />
              </span>
              Upcoming Maturities
            </h2>
            <Link to="/gold-savings/maturity" className="gs-home-view-all">
              View all
            </Link>
          </div>
          {maturingAccounts.length === 0 ? (
            <PanelEmpty
              icon={CalendarDays}
              title="No upcoming maturities"
              description="No accounts maturing in the next 6 months."
            />
          ) : (
            <MaturityRows accounts={maturingAccounts} />
          )}
        </section>
      </div>
    </div>
  )
}
