import { useEffect, useMemo, useState } from 'react'
import { IndianRupee } from 'lucide-react'
import { localTodayIso } from '@shared/localDate'
import type { GoldSavingAccount, GoldSavingInstallmentStatus } from '@shared/types'
import { DataTable } from '../../../components/DataTable'
import { EmptyState } from '../../../components/EmptyState'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { SearchBar } from '../../../components/SearchBar'
import { StatCard } from '../../../components/StatCard'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../../lib/format'
import { api } from '../../../lib/api'
import { PrintPreviewModal } from '../../print/PrintPreviewModal'
import { GsStatusBadge } from '../GsStatusBadge'
import { CollectPaymentModal } from './CollectPaymentModal'

function dueStatus(nextDueDate: string, today: string): GoldSavingInstallmentStatus {
  if (nextDueDate < today) return 'overdue'
  if (nextDueDate === today) return 'due'
  return 'upcoming'
}

function matchesSearch(account: GoldSavingAccount, query: string): boolean {
  if (!query) return true
  const haystack = `${account.customerName} ${account.accountNo} ${account.customerPhone} ${account.customerId} ${account.schemeName}`.toLowerCase()
  return haystack.includes(query)
}

export function CollectionsPage() {
  const [accounts, setAccounts] = useState<GoldSavingAccount[]>([])
  const [search, setSearch] = useState('')
  const [account, setAccount] = useState<GoldSavingAccount | null>(null)
  const [collectOpen, setCollectOpen] = useState(false)
  const [printPaymentId, setPrintPaymentId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const today = localTodayIso()

  async function loadAccounts() {
    const rows = await api.listGsAccounts()
    setAccounts(rows)
    setError(null)
    return rows
  }

  useEffect(() => {
    let active = true
    void api
      .listGsAccounts()
      .then((rows) => {
        if (!active) return
        setAccounts(rows)
        setError(null)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load collections')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const pending = useMemo(() => {
    return accounts
      .filter((row) => row.status === 'active' && row.nextDueDate)
      .sort((a, b) => (a.nextDueDate ?? '').localeCompare(b.nextDueDate ?? ''))
  }, [accounts])

  const query = search.trim().toLowerCase()
  const visible = useMemo(() => pending.filter((row) => matchesSearch(row, query)), [pending, query])

  return (
    <div className="app-page">
      <PageHeader
        title="Monthly collections"
        subtitle="Search an account, review the summary, then collect the next installment"
        actions={
          <>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search account number, name, mobile or customer ID…"
            />
            {account ? (
              <button type="button" className="btn" onClick={() => setCollectOpen(true)}>
                <IndianRupee size={18} strokeWidth={1.75} aria-hidden />
                Collect next installment
              </button>
            ) : null}
          </>
        }
      />
      {error ? <div className="error-banner">{error}</div> : null}
      {account ? (
        <div className="stat-card-grid">
          <StatCard label="Monthly installment" value={formatCurrency(account.monthlyAmount)} />
          <StatCard label="Paid / total" value={`${account.paidInstallments} / ${account.durationMonths}`} />
          <StatCard label="Amount paid" value={formatCurrency(account.totalPaid)} tone="success" />
          <StatCard label="Gold accumulated" value={formatWeight(account.goldAccumulated, 3)} />
          <StatCard label="Next due" value={account.nextDueDate ? formatDisplayDate(account.nextDueDate) : '—'} />
          <StatCard label="Status" value={<GsStatusBadge status={account.status} />} />
        </div>
      ) : null}
      {loading ? (
        <LoadingState />
      ) : pending.length === 0 ? (
        <EmptyState title="No pending installments" description="Every active scheme account is up to date." />
      ) : visible.length === 0 ? (
        <EmptyState title="No matching accounts" description="Try a different account number, name or mobile." />
      ) : (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Account</th>
                <th>Scheme</th>
                <th className="num">Monthly</th>
                <th className="num">Paid / total</th>
                <th>Next due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const nextDue = row.nextDueDate ?? ''
                const status = dueStatus(nextDue, today)
                const selected = account?.id === row.id
                return (
                  <tr
                    key={row.id}
                    className={`gs-collect-row${status === 'overdue' ? ' is-overdue' : ''}${selected ? ' is-selected' : ''}`}
                    tabIndex={0}
                    aria-selected={selected}
                    onClick={() => setAccount(row)}
                    onDoubleClick={() => {
                      setAccount(row)
                      setCollectOpen(true)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        // Enter starts collection straight away; Space only selects.
                        setAccount(row)
                        setCollectOpen(true)
                      } else if (event.key === ' ') {
                        event.preventDefault()
                        setAccount(row)
                      }
                    }}
                  >
                    <td>
                      {row.customerName}
                      <div className="muted">{row.customerPhone}</div>
                    </td>
                    <td>{row.accountNo}</td>
                    <td>{row.schemeName}</td>
                    <td className="num">{formatCurrency(row.monthlyAmount)}</td>
                    <td className="num">
                      {row.paidInstallments} / {row.durationMonths}
                    </td>
                    <td>{nextDue ? formatDisplayDate(nextDue) : '—'}</td>
                    <td>
                      <GsStatusBadge status={status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataTable>
      )}
      {collectOpen && account ? (
        <CollectPaymentModal
          accountId={account.id}
          onClose={() => setCollectOpen(false)}
          onCollected={(paymentId) => {
            setCollectOpen(false)
            setPrintPaymentId(paymentId)
            void Promise.all([api.getGsAccount(account.id), loadAccounts()]).then(([next]) => {
              setAccount(next.account)
            })
          }}
        />
      ) : null}
      {printPaymentId ? (
        <PrintPreviewModal
          title="Collection receipt"
          path={`/print/gs-batch-receipt/${printPaymentId}`}
          pdfFilename="gs-receipt.pdf"
          onClose={() => setPrintPaymentId(null)}
        />
      ) : null}
    </div>
  )
}
