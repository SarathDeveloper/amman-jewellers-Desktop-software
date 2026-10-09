import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, MessageCircle, Printer } from 'lucide-react'
import type { GoldSavingAccount, GoldSavingReportResult, GoldSavingScheme } from '@shared/types'
import { DataTable } from '../../../components/DataTable'
import { EmptyState } from '../../../components/EmptyState'
import { FilterBar } from '../../../components/FilterBar'
import { LoadingState } from '../../../components/LoadingState'
import { PageHeader } from '../../../components/PageHeader'
import { SearchBar } from '../../../components/SearchBar'
import { StatCard } from '../../../components/StatCard'
import { formatCurrency, formatDisplayDate } from '../../../lib/format'
import { api } from '../../../lib/api'
import { goldSavingsReminderMessage, whatsappLink } from '../../../lib/whatsapp'
import { PrintPreviewModal } from '../../print/PrintPreviewModal'
import { useShopBranding } from '../../settings/shopBrandingContext'

type BucketFilter = 'all' | '1-7 days' | '8-15 days' | '16-30 days' | '30+ days'

const BUCKET_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: '1-7 days', label: '1-7 days' },
  { value: '8-15 days', label: '8-15 days' },
  { value: '16-30 days', label: '16-30 days' },
  { value: '30+ days', label: '30+ days' },
] as const

function num(row: Record<string, string | number>, column: string): number {
  return Number(row[column] || 0)
}

function text(row: Record<string, string | number>, column: string): string {
  return String(row[column] ?? '')
}

export function OverdueAgingPage() {
  const [result, setResult] = useState<GoldSavingReportResult | null>(null)
  const [accounts, setAccounts] = useState<GoldSavingAccount[]>([])
  const [schemes, setSchemes] = useState<GoldSavingScheme[]>([])
  const [schemeId, setSchemeId] = useState('')
  const [search, setSearch] = useState('')
  const [bucket, setBucket] = useState<BucketFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [printOpen, setPrintOpen] = useState(false)
  const { shopName } = useShopBranding()

  useEffect(() => {
    void Promise.all([api.listGsSchemes(), api.listGsAccounts()])
      .then(([schemeList, accountList]) => {
        setSchemes(schemeList ?? [])
        setAccounts(accountList ?? [])
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load overdue aging')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    let active = true
    const delay = search ? 200 : 0
    const handle = window.setTimeout(() => {
      void api
        .runGsReport('overdue-aging', {
          schemeId: schemeId ? Number(schemeId) : undefined,
          q: search || undefined,
        })
        .then((next) => {
          if (!active) return
          setResult(next)
          setError(null)
        })
        .catch((err: unknown) => {
          if (!active) return
          setError(err instanceof Error ? err.message : 'Failed to load overdue aging')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, delay)
    return () => {
      active = false
      window.clearTimeout(handle)
    }
  }, [schemeId, search])

  const accountIds = useMemo(() => {
    const map = new Map<string, number>()
    for (const account of accounts) map.set(account.accountNo, account.id)
    return map
  }, [accounts])
  const visible = useMemo(() => {
    const rows = result?.rows ?? []
    return bucket === 'all' ? rows : rows.filter((row) => text(row, 'Bucket') === bucket)
  }, [result, bucket])
  const affectedAccounts = new Set(visible.map((row) => text(row, 'Account'))).size
  const amount = visible.reduce((sum, row) => sum + num(row, 'Amount'), 0)
  const grouped = useMemo(() => {
    const order = ['1-7 days', '8-15 days', '16-30 days', '30+ days']
    return order
      .map((key) => ({
        bucket: key,
        rows: visible.filter((row) => text(row, 'Bucket') === key),
      }))
      .filter((group) => group.rows.length > 0)
  }, [visible])

  function exportCsv() {
    if (!result) return
    const lines = [
      result.columns.join(','),
      ...visible.map((row) =>
        result.columns
          .map((col) => {
            const value = row[col] ?? ''
            if (col === 'Due' && typeof value === 'string') return formatDisplayDate(String(value).slice(0, 10))
            return String(value)
          })
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'overdue-aging.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const callListPath = useMemo(() => {
    const params = new URLSearchParams()
    if (bucket !== 'all') params.set('bucket', bucket)
    if (schemeId) params.set('schemeId', schemeId)
    if (search) params.set('q', search)
    const qs = params.toString()
    return `/print/gs-call-list${qs ? `?${qs}` : ''}`
  }, [bucket, schemeId, search])

  function reminderHref(row: Record<string, string | number>): string | null {
    const phone = text(row, 'Mobile')
    if (!phone) return null
    return whatsappLink(
      phone,
      goldSavingsReminderMessage({
        shopName,
        customerName: text(row, 'Customer'),
        accountNo: text(row, 'Account'),
        installmentNo: num(row, 'Installment') || undefined,
        dueDate: text(row, 'Due').slice(0, 10),
        amount: num(row, 'Amount'),
      }),
    )
  }

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title="Overdue aging"
        subtitle="Unpaid installments grouped by how long they are overdue"
        actions={
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Search account, name or mobile..." />
            <button
              type="button"
              className="btn secondary"
              onClick={() => setPrintOpen(true)}
              disabled={visible.length === 0}
            >
              <Printer size={16} strokeWidth={1.75} aria-hidden />
              Print call list
            </button>
            <button type="button" className="btn secondary" onClick={exportCsv} disabled={visible.length === 0}>
              <Download size={16} strokeWidth={1.75} aria-hidden />
              Export CSV
            </button>
          </>
        }
      />
      <div className="filter-bar reports-filters">
        <label>
          Scheme
          <select className="select" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
            <option value="">All schemes</option>
            {schemes.map((scheme) => (
              <option key={scheme.id} value={scheme.id}>
                {scheme.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FilterBar value={bucket} onChange={setBucket} options={[...BUCKET_OPTIONS]} />
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="stat-card-grid">
        <StatCard label="Overdue installments" value={String(visible.length)} tone={visible.length > 0 ? 'danger' : undefined} />
        <StatCard label="Accounts affected" value={String(affectedAccounts)} />
        <StatCard label="Amount at risk" value={formatCurrency(amount)} tone={amount > 0 ? 'danger' : undefined} />
      </div>
      {loading ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        <EmptyState title="No overdue installments" description="Every active scheme account is up to date." />
      ) : (
        grouped.map((group) => (
          <section key={group.bucket} className="gs-overdue-group">
            <h2 className="dashboard-section-title">
              {group.bucket}
              <span className="muted">
                {' '}
                · {group.rows.length} · {formatCurrency(group.rows.reduce((sum, row) => sum + num(row, 'Amount'), 0))}
              </span>
            </h2>
            <DataTable>
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Customer</th>
                    <th>Mobile</th>
                    <th>Scheme</th>
                    <th>Inst.</th>
                    <th>Due</th>
                    <th className="num">Days</th>
                    <th className="num">Amount</th>
                    <th aria-label="Reminder" />
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, index) => {
                    const href = reminderHref(row)
                    return (
                      <tr key={`${text(row, 'Account')}-${text(row, 'Installment')}-${index}`}>
                        <td>
                          <OverdueAccountLink accountNo={text(row, 'Account')} accountId={accountIds.get(text(row, 'Account'))} />
                        </td>
                        <td>{text(row, 'Customer')}</td>
                        <td className="muted">{text(row, 'Mobile') || '—'}</td>
                        <td>{text(row, 'Scheme')}</td>
                        <td>{text(row, 'Installment')}</td>
                        <td>{formatDisplayDate(text(row, 'Due').slice(0, 10))}</td>
                        <td className="num">{text(row, 'Days overdue')}</td>
                        <td className="num">{formatCurrency(num(row, 'Amount'))}</td>
                        <td className="gs-reminder-cell">
                          {href ? (
                            <a
                              className="btn ghost btn-sm"
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              title="Send a WhatsApp reminder"
                            >
                              <MessageCircle size={15} strokeWidth={1.75} aria-hidden />
                              Remind
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </DataTable>
          </section>
        ))
      )}
      {printOpen ? (
        <PrintPreviewModal
          title="Scheme call list"
          path={callListPath}
          pdfFilename="gs-call-list.pdf"
          onClose={() => setPrintOpen(false)}
        />
      ) : null}
    </div>
  )
}

function OverdueAccountLink({ accountNo, accountId }: { accountNo: string; accountId?: number }) {
  if (!accountId) return <>{accountNo}</>
  return <Link to={`/gold-savings/accounts/${accountId}`}>{accountNo}</Link>
}
