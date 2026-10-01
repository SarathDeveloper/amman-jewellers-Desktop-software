import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import type { GoldSavingAccount } from '@shared/types'
import { DataTable, TablePager } from '../../../components/DataTable'
import { EmptyState } from '../../../components/EmptyState'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { SearchBar } from '../../../components/SearchBar'
import { formatCurrency, formatDisplayDate, formatWeight, paginate, TABLE_PAGE_SIZE } from '../../../lib/format'
import { api } from '../../../lib/api'
import { GsStatusBadge } from '../GsStatusBadge'

export function AccountsListPage() {
  const [accounts, setAccounts] = useState<GoldSavingAccount[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api
      .listGsAccounts(search)
      .then((rows) => {
        if (active) {
          setAccounts(rows)
          setPage(1)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load accounts')
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [search])

  const rows = useMemo(() => paginate(accounts, page, TABLE_PAGE_SIZE), [accounts, page])

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title="Scheme accounts"
        subtitle="Search enrolled customers and open a scheme account"
        actions={
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Search account, name or mobile..." />
            <Link className="btn" to="/gold-savings/enroll">
              <UserPlus size={18} strokeWidth={2} aria-hidden />
              Enroll
            </Link>
          </>
        }
      />
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? (
        <LoadingState />
      ) : accounts.length === 0 ? (
        <EmptyState title="No scheme accounts" description="Enroll a customer to create the first account." />
      ) : (
        <DataTable footer={<TablePager page={page} total={accounts.length} onPageChange={setPage} />}>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Customer</th>
                <th>Scheme</th>
                <th>Enrolled</th>
                <th>Maturity</th>
                <th className="num">Paid</th>
                <th className="num">Gold</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((account) => (
                <tr key={account.id}>
                  <td>
                    <Link to={`/gold-savings/accounts/${account.id}`}>{account.accountNo}</Link>
                  </td>
                  <td>
                    {account.customerName}
                    <div className="muted">{account.customerPhone}</div>
                  </td>
                  <td>{account.schemeName}</td>
                  <td>{formatDisplayDate(account.enrollmentDate)}</td>
                  <td>{formatDisplayDate(account.maturityDate)}</td>
                  <td className="num">{formatCurrency(account.totalPaid)}</td>
                  <td className="num">{formatWeight(account.goldAccumulated, 3)}</td>
                  <td>
                    <GsStatusBadge status={account.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}
    </div>
  )
}
