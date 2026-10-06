import { useEffect, useMemo, useState } from 'react'
import { Gem, Receipt } from 'lucide-react'
import type { DuesLedger, Invoice } from '@shared/types'
import { PageHeader } from '../../components/PageHeader'
import { SearchBar } from '../../components/SearchBar'
import { StatCard } from '../../components/StatCard'
import { formatCurrency } from '../../lib/format'
import { api } from '../../lib/api'
import { computeTodayCollections } from '../dashboard/dashboardStats'
import { localTodayIso } from '@shared/localDate'
import { AdaguDuesTab } from './AdaguDuesTab'
import { BillDuesTab } from './BillDuesTab'
import { billColumns, billOutstanding, emptyDuesLedger, isBillEntry } from './duesHelpers'

type DuesTab = 'bills' | 'adagu'

export function DuesPage() {
  const today = localTodayIso()
  const [tab, setTab] = useState<DuesTab>('bills')
  const [search, setSearch] = useState('')
  const [ledger, setLedger] = useState<DuesLedger>(emptyDuesLedger())
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadLedger() {
    setError(null)
    const [data, todayBills] = await Promise.all([
      api.listDues(search),
      api.listInvoices({ from: today, to: today, page: 1, pageSize: 50 }),
    ])
    const ledger: DuesLedger = {
      ...data,
      adaguDues: data.adaguDues ?? [],
      adaguOutstanding: data.adaguOutstanding ?? 0,
    }
    setLedger(ledger)
    setInvoices(todayBills.items ?? [])
    return ledger
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        setLoading(true)
        await loadLedger()
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load dues')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search triggers IPC reload
  }, [search])

  const billCols = useMemo(() => billColumns(ledger.columns), [ledger.columns])
  const billTotal = useMemo(() => billOutstanding(ledger.columns), [ledger.columns])
  const billWithDues = billCols.filter((column) => column.balance > 0).length
  const billAverage = billWithDues > 0 ? billTotal / billWithDues : 0
  const adaguDues = ledger.adaguDues ?? []
  const adaguTotal = ledger.adaguOutstanding ?? 0
  const activeLoans = adaguDues.filter((row) => row.status === 'active' && row.remaining > 0).length
  const overdueInterest = adaguDues.filter((row) => row.isInterestOverdue).length

  const todayCollections = useMemo(() => {
    const entries = (ledger.columns ?? []).flatMap((column) =>
      tab === 'bills'
        ? (column.entries ?? []).filter(isBillEntry)
        : (column.entries ?? []).filter((entry) => entry.pledgeId !== null),
    )
    return computeTodayCollections(tab === 'bills' ? invoices : [], entries, today)
  }, [ledger, invoices, today, tab])

  return (
    <div className="dues-shell">
      <div className="billing-chrome">
        <div className="billing-chrome-tabs" role="tablist" aria-label="Dues">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'bills'}
            className={`billing-chrome-tab${tab === 'bills' ? ' active' : ''}`}
            onClick={() => setTab('bills')}
          >
            <span className="billing-chrome-tab-icon" aria-hidden>
              <Receipt size={18} strokeWidth={1.75} />
            </span>
            <span className="billing-chrome-tab-label">Bill Dues</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'adagu'}
            className={`billing-chrome-tab${tab === 'adagu' ? ' active' : ''}`}
            onClick={() => setTab('adagu')}
          >
            <span className="billing-chrome-tab-icon" aria-hidden>
              <Gem size={18} strokeWidth={1.75} />
            </span>
            <span className="billing-chrome-tab-label">Adagu Dues</span>
          </button>
        </div>
      </div>

      <div className="dues-page app-page app-page-fill">
        <PageHeader
          title="Customer Dues"
          subtitle={
            tab === 'bills'
              ? 'Cash bill and tax invoice balances'
              : 'Adagu loans, monthly interest, extra cash, and gold release'
          }
          actions={
            <SearchBar
              value={search}
              onChange={(value) => setSearch(value)}
              placeholder={tab === 'bills' ? 'Search customer...' : 'Search customer or ADG no...'}
            />
          }
        />

        <div className="stat-card-grid">
          {tab === 'bills' ? (
            <>
              <StatCard label="Total Outstanding" value={formatCurrency(billTotal)} tone="danger" />
              <StatCard label="Customers With Dues" value={billWithDues} />
              <StatCard label="Average Due" value={formatCurrency(billAverage)} />
              <StatCard label="Today's Collections" value={formatCurrency(todayCollections)} tone="success" />
            </>
          ) : (
            <>
              <StatCard label="Adagu Outstanding" value={formatCurrency(adaguTotal)} tone="danger" />
              <StatCard label="Active Loans" value={activeLoans} />
              <StatCard label="Interest Overdue" value={overdueInterest} tone={overdueInterest > 0 ? 'danger' : undefined} />
              <StatCard label="Today's Collections" value={formatCurrency(todayCollections)} tone="success" />
            </>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="dues-tab-panel">
          {tab === 'bills' ? (
            <BillDuesTab
              ledger={ledger}
              loading={loading}
              error={error}
              onError={setError}
              onReload={loadLedger}
            />
          ) : (
            <AdaguDuesTab
              ledger={ledger}
              loading={loading}
              error={error}
              onError={setError}
              onReload={loadLedger}
            />
          )}
        </div>
      </div>
    </div>
  )
}
