import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Coins,
  IndianRupee,
  LayoutDashboard,
  PiggyBank,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { GoldSavingDashboard } from '@shared/types'
import { PageHeader } from '../../components/PageHeader'
import { LoadingState } from '../../components/LoadingState'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../lib/format'
import { api } from '../../lib/api'
import { GsStatusBadge } from './GsStatusBadge'

type KpiTone = 'brand' | 'success' | 'danger' | 'info'

function KpiCard({
  to,
  label,
  value,
  icon: Icon,
  tone,
}: {
  to?: string
  label: string
  value: string
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
      <div className="app-page dashboard-page">
        <LoadingState />
      </div>
    )
  }
  if (error) {
    return (
      <div className="app-page dashboard-page">
        <div className="error-banner">{error}</div>
      </div>
    )
  }
  if (!data) return null

  const maxChart = Math.max(...data.monthlyChart.map((point) => point.amount), 1)
  const maxEnroll = Math.max(...data.schemeEnrollments.map((row) => row.count), 1)

  return (
    <div className="app-page dashboard-page">
      <PageHeader
        title="Monthly Gold Savings"
        subtitle="Scheme collections, enrollments and upcoming maturities"
        actions={
          <>
            <Link className="btn" to="/gold-savings/enroll">
              <UserPlus size={18} strokeWidth={2} aria-hidden />
              Enroll customer
            </Link>
            <Link className="btn secondary" to="/gold-savings/collections">
              <IndianRupee size={18} strokeWidth={1.75} aria-hidden />
              Collect payment
            </Link>
          </>
        }
      />

      <div className="dashboard-kpi-grid">
        <KpiCard
          to="/gold-savings/schemes"
          label="Active schemes"
          value={String(data.activeSchemes)}
          icon={LayoutDashboard}
          tone="brand"
        />
        <KpiCard
          to="/gold-savings/accounts"
          label="Enrolled customers"
          value={String(data.enrolledCustomers)}
          icon={Users}
          tone="info"
        />
        <KpiCard
          to="/gold-savings/collections"
          label="Today's collections"
          value={formatCurrency(data.todayCollections)}
          icon={IndianRupee}
          tone="success"
        />
        <KpiCard
          label="This month"
          value={formatCurrency(data.monthCollections)}
          icon={PiggyBank}
          tone="brand"
        />
        <KpiCard
          label="Total collected"
          value={formatCurrency(data.totalCollected)}
          icon={IndianRupee}
          tone="info"
        />
        <KpiCard
          label="Gold accumulated"
          value={formatWeight(data.totalGold, 3)}
          icon={Coins}
          tone="brand"
        />
        <KpiCard
          to="/gold-savings/maturity"
          label="Upcoming maturities"
          value={String(data.upcomingMaturities)}
          icon={PiggyBank}
          tone="info"
        />
        <KpiCard
          to="/gold-savings/accounts"
          label="Overdue installments"
          value={String(data.overdueInstallments)}
          icon={AlertTriangle}
          tone={data.overdueInstallments > 0 ? 'danger' : 'info'}
        />
      </div>

      <section className="dashboard-quick-section" aria-label="Quick actions">
        <h2 className="dashboard-quick-title">Quick actions</h2>
        <div className="dashboard-quick-actions">
          <Link to="/gold-savings/enroll" className="btn dashboard-quick-primary">
            <Plus size={18} strokeWidth={2} aria-hidden />
            New enrollment
          </Link>
          <Link to="/gold-savings/collections" className="btn secondary dashboard-quick-btn">
            <IndianRupee size={18} strokeWidth={1.75} aria-hidden />
            Collect installment
          </Link>
          <Link to="/gold-savings/accounts" className="btn secondary dashboard-quick-btn">
            <Users size={18} strokeWidth={1.75} aria-hidden />
            Accounts
          </Link>
          <Link to="/gold-savings/schemes" className="btn secondary dashboard-quick-btn">
            <LayoutDashboard size={18} strokeWidth={1.75} aria-hidden />
            Schemes
          </Link>
        </div>
      </section>

      <div className="dashboard-mid-grid">
        <section className="card padded dashboard-panel">
          <div className="dashboard-panel-head">
            <h2>Monthly collections</h2>
          </div>
          <div className="dashboard-sales-chart" role="img" aria-label="Monthly collections">
            <div className="dashboard-sales-bars">
              {data.monthlyChart.length === 0 ? (
                <p className="dashboard-empty-state">No collections yet</p>
              ) : (
                data.monthlyChart.map((point) => (
                  <div key={point.key} className="dashboard-sales-bar-col">
                    <div className="dashboard-sales-bar-track">
                      <div
                        className="dashboard-sales-bar-fill"
                        style={{ height: `${(point.amount / maxChart) * 100}%` }}
                        title={`${point.label}: ${formatCurrency(point.amount)}`}
                      />
                    </div>
                    <span className="dashboard-sales-bar-label">{point.label}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
        <section className="card padded dashboard-panel">
          <div className="dashboard-panel-head">
            <h2>Scheme-wise enrollment</h2>
          </div>
          {data.schemeEnrollments.length === 0 ? (
            <p className="dashboard-empty-state">No schemes yet</p>
          ) : (
            <div className="gs-enroll-bars">
              {data.schemeEnrollments.map((row) => (
                <div key={row.schemeName} className="gs-enroll-row">
                  <span>{row.schemeName}</span>
                  <div className="gs-enroll-track">
                    <div style={{ width: `${(row.count / maxEnroll) * 100}%` }} />
                  </div>
                  <strong className="num">{row.count}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="dashboard-lower-grid">
        <ListCard title="Upcoming dues" empty="No dues in the next 7 days" to="/gold-savings/collections">
          {data.upcomingDues.map((account) => (
            <Link key={account.id} to={`/gold-savings/accounts/${account.id}`} className="dashboard-due-row">
              <span className="dashboard-due-name">{account.customerName}</span>
              <span className="muted">
                {account.accountNo} · {account.nextDueDate ? formatDisplayDate(account.nextDueDate) : '—'}
              </span>
            </Link>
          ))}
        </ListCard>
        <ListCard title="Recent collections" empty="No collections yet" to="/gold-savings/collections">
          {data.recentCollections.map((payment) => (
            <div key={payment.id} className="dashboard-due-row">
              <span className="dashboard-due-name">{payment.customerName}</span>
              <span className="muted">
                {payment.receiptNo} · {formatCurrency(payment.amount)} · {formatWeight(payment.goldWeight, 3)}
              </span>
            </div>
          ))}
        </ListCard>
        <ListCard title="Recently enrolled" empty="No enrollments yet" to="/gold-savings/accounts">
          {data.recentEnrollments.map((account) => (
            <Link key={account.id} to={`/gold-savings/accounts/${account.id}`} className="dashboard-due-row">
              <span className="dashboard-due-name">{account.customerName}</span>
              <span className="muted">
                {account.accountNo} · {formatDisplayDate(account.enrollmentDate)}
              </span>
            </Link>
          ))}
        </ListCard>
        <ListCard title="Maturing accounts" empty="No accounts maturing soon" to="/gold-savings/maturity">
          {data.maturingAccounts.map((account) => (
            <Link key={account.id} to={`/gold-savings/accounts/${account.id}`} className="dashboard-due-row">
              <span className="dashboard-due-name">{account.customerName}</span>
              <span className="muted">
                {formatDisplayDate(account.maturityDate)} · <GsStatusBadge status={account.status} />
              </span>
            </Link>
          ))}
        </ListCard>
      </div>
    </div>
  )
}

function ListCard({
  title,
  empty,
  to,
  children,
}: {
  title: string
  empty: string
  to: string
  children: ReactNode
}) {
  const items = Array.isArray(children) ? children : [children]
  const hasItems = items.filter(Boolean).length > 0
  return (
    <section>
      <div className="dashboard-section-head">
        <h2 className="dashboard-section-title">{title}</h2>
        <Link to={to} className="dashboard-panel-link">
          View all
        </Link>
      </div>
      {hasItems ? (
        <div className="card dashboard-due-list">{children}</div>
      ) : (
        <div className="card padded dashboard-empty-state">{empty}</div>
      )}
    </section>
  )
}
