import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { GoldSavingReportId, GoldSavingReportResult, GoldSavingScheme } from '@shared/types'
import { DateInput } from '../../../components/DateInput'
import { PageHeader } from '../../../components/PageHeader'
import { StatCard } from '../../../components/StatCard'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../../lib/format'
import { api } from '../../../lib/api'

const REPORTS: { id: GoldSavingReportId; title: string }[] = [
  { id: 'daily-collections', title: 'Daily collections' },
  { id: 'monthly-collections', title: 'Monthly collections' },
  { id: 'customer-ledger', title: 'Customer ledger' },
  { id: 'scheme-performance', title: 'Scheme performance' },
  { id: 'active-schemes', title: 'Active schemes' },
  { id: 'matured-schemes', title: 'Matured schemes' },
  { id: 'overdue-installments', title: 'Overdue installments' },
  { id: 'overdue-aging', title: 'Overdue aging' },
  { id: 'cancelled-schemes', title: 'Cancelled schemes' },
  { id: 'gold-accumulation', title: 'Gold accumulation' },
  { id: 'redemption-history', title: 'Redemption history' },
  { id: 'outstanding-obligations', title: 'Outstanding obligations' },
]

const DATE_COLUMNS = new Set(['Date', 'Enrolled', 'Maturity', 'Due'])
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function formatMonthKey(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key.trim())
  if (!match) return key
  const month = Number(match[2])
  if (month < 1 || month > 12) return key
  return MONTHS[month - 1] ?? key
}

function formatReportCell(column: string, value: string | number): string {
  if (DATE_COLUMNS.has(column) && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDisplayDate(value.slice(0, 10))
  }
  if (column === 'Month' && typeof value === 'string') {
    const label = formatMonthKey(value)
    return label === value ? value : `${label} ${value.slice(0, 4)}`
  }
  return String(value)
}

function sumCol(result: GoldSavingReportResult, column: string): number {
  return result.rows.reduce((sum, row) => sum + Number(row[column] || 0), 0)
}

function uniqueCount(result: GoldSavingReportResult, column: string): number {
  return new Set(result.rows.map((row) => String(row[column] ?? ''))).size
}

function reportSummaries(result: GoldSavingReportResult): { label: string; value: string; tone?: 'brand' | 'success' | 'danger' }[] {
  switch (result.id) {
    case 'daily-collections':
      return [
        { label: 'Payments', value: String(result.rows.length) },
        { label: 'Total amount', value: formatCurrency(sumCol(result, 'Amount')), tone: 'success' },
        { label: 'Total gold', value: formatWeight(sumCol(result, 'Gold'), 3), tone: 'brand' },
      ]
    case 'monthly-collections': {
      const total = sumCol(result, 'Amount')
      const months = result.rows.length
      return [
        { label: 'Months', value: String(months) },
        { label: 'Grand total', value: formatCurrency(total), tone: 'success' },
        { label: 'Average monthly', value: formatCurrency(months > 0 ? total / months : 0) },
        { label: 'Total gold', value: formatWeight(sumCol(result, 'Gold'), 3), tone: 'brand' },
      ]
    }
    case 'scheme-performance':
      return [
        { label: 'Schemes', value: String(result.rows.length) },
        { label: 'Total accounts', value: String(sumCol(result, 'Accounts')) },
        { label: 'Total collected', value: formatCurrency(sumCol(result, 'Collected')), tone: 'success' },
        { label: 'Total gold', value: formatWeight(sumCol(result, 'Gold'), 3), tone: 'brand' },
      ]
    case 'overdue-installments':
    case 'overdue-aging':
      return [
        { label: 'Overdue rows', value: String(result.rows.length), tone: result.rows.length > 0 ? 'danger' : undefined },
        { label: 'Accounts', value: String(uniqueCount(result, 'Account')) },
        { label: 'Amount at risk', value: formatCurrency(sumCol(result, 'Amount')), tone: 'danger' },
      ]
    case 'customer-ledger':
      return [
        { label: 'Entries', value: String(result.rows.length) },
        { label: 'Accounts', value: String(uniqueCount(result, 'Account')) },
        { label: 'Amount', value: formatCurrency(sumCol(result, 'Amount')) },
        { label: 'Gold movement', value: formatWeight(sumCol(result, 'Gold'), 3), tone: 'brand' },
      ]
    case 'gold-accumulation':
      return [
        { label: 'Accounts', value: String(result.rows.length) },
        { label: 'Paid', value: formatCurrency(sumCol(result, 'Paid')), tone: 'success' },
        { label: 'Gold', value: formatWeight(sumCol(result, 'Gold'), 3), tone: 'brand' },
      ]
    case 'redemption-history':
      return [
        { label: 'Redemptions', value: String(result.rows.length) },
        { label: 'Gold redeemed', value: formatWeight(sumCol(result, 'Gold'), 3), tone: 'brand' },
        { label: 'Bonus gold', value: formatWeight(sumCol(result, 'Bonus'), 3) },
      ]
    case 'outstanding-obligations':
      return [
        { label: 'Accounts', value: String(result.rows.length) },
        { label: 'Pending installments', value: String(sumCol(result, 'Pending')) },
        { label: 'Gold held', value: formatWeight(sumCol(result, 'Gold'), 3), tone: 'brand' },
      ]
    default:
      return [
        { label: 'Accounts', value: String(result.rows.length) },
        { label: 'Paid', value: formatCurrency(sumCol(result, 'Paid')), tone: 'success' },
        { label: 'Gold', value: formatWeight(sumCol(result, 'Gold'), 3), tone: 'brand' },
      ]
  }
}

export function GoldSavingsReportsPage() {
  const [reportId, setReportId] = useState<GoldSavingReportId>('daily-collections')
  const [schemes, setSchemes] = useState<GoldSavingScheme[]>([])
  const [schemeId, setSchemeId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [result, setResult] = useState<GoldSavingReportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reportTitle = REPORTS.find((report) => report.id === reportId)?.title ?? 'Gold savings reports'
  const summaries = result ? reportSummaries(result) : []

  useEffect(() => {
    void api.listGsSchemes().then(setSchemes).catch(() => setSchemes([]))
  }, [])

  useEffect(() => {
    let active = true
    void api
      .runGsReport(reportId, {
        from: from || undefined,
        to: to || undefined,
        schemeId: schemeId ? Number(schemeId) : undefined,
        q: q || undefined,
      })
      .then((next) => {
        if (active) {
          setResult(next)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to run report')
      })
    return () => {
      active = false
    }
  }, [reportId, from, to, schemeId, q])

  function exportCsv() {
    if (!result) return
    const lines = [
      result.columns.join(','),
      ...result.rows.map((row) => result.columns.map((col) => formatReportCell(col, row[col] ?? '')).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${result.id}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title={reportTitle}
        subtitle="Gold savings"
        actions={
          <button type="button" className="btn secondary" onClick={exportCsv} disabled={!result}>
            <Download size={16} strokeWidth={1.75} aria-hidden />
            Export CSV
          </button>
        }
      />
      <div className="filter-bar reports-filters">
        <label>
          Report
          <select className="select" value={reportId} onChange={(e) => setReportId(e.target.value as GoldSavingReportId)}>
            {REPORTS.map((report) => (
              <option key={report.id} value={report.id}>
                {report.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <DateInput className="input" value={from} onChange={setFrom} showIcon />
        </label>
        <label>
          To
          <DateInput className="input" value={to} onChange={setTo} showIcon />
        </label>
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
        <label>
          Search
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {result && summaries.length > 0 ? (
        <div className="stat-card-grid">
          {summaries.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} tone={card.tone} />
          ))}
        </div>
      ) : null}
      {result?.id === 'monthly-collections' ? <MonthlyCollectionsChart result={result} /> : null}
      {result?.id === 'scheme-performance' ? <SchemePerformanceChart result={result} /> : null}
      {result ? (
        <div className="card table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                {result.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 ? (
                <tr>
                  <td className="empty-cell" colSpan={result.columns.length}>
                    No rows for this selection.
                  </td>
                </tr>
              ) : (
                result.rows.map((row, index) => (
                  <tr key={index}>
                    {result.columns.map((column) => (
                      <td key={column}>{formatReportCell(column, row[column] ?? '')}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function MonthlyCollectionsChart({ result }: { result: GoldSavingReportResult }) {
  const points = useMemo(() => {
    return [...result.rows]
      .map((row) => ({
        key: String(row.Month ?? ''),
        amount: Number(row.Amount || 0),
      }))
      .reverse()
  }, [result.rows])
  const max = Math.max(...points.map((point) => point.amount), 1)
  if (points.length === 0) return null
  return (
    <section className="card padded dashboard-panel gs-report-chart">
      <div className="dashboard-panel-head">
        <h2>Monthly collections</h2>
      </div>
      <div className="dashboard-sales-chart" role="img" aria-label="Monthly collections">
        <div className="dashboard-sales-bars">
          {points.map((point) => (
            <div key={point.key} className="dashboard-sales-bar-col">
              <div className="dashboard-sales-bar-track">
                <div
                  className="dashboard-sales-bar-fill"
                  style={{ height: `${(point.amount / max) * 100}%` }}
                  title={`${formatMonthKey(point.key)}: ${formatCurrency(point.amount)}`}
                />
              </div>
              <span className="dashboard-sales-bar-label">{formatMonthKey(point.key)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SchemePerformanceChart({ result }: { result: GoldSavingReportResult }) {
  const rows = result.rows
  const max = Math.max(...rows.map((row) => Number(row.Collected || 0)), 1)
  if (rows.length === 0) return null
  return (
    <section className="card padded dashboard-panel gs-report-chart">
      <div className="dashboard-panel-head">
        <h2>Collected by scheme</h2>
      </div>
      <div className="gs-enroll-bars">
        {rows.map((row) => (
          <div key={String(row.Scheme)} className="gs-enroll-row gs-scheme-perf-row">
            <span>{row.Scheme}</span>
            <div className="gs-enroll-track">
              <div style={{ width: `${(Number(row.Collected || 0) / max) * 100}%` }} />
            </div>
            <strong className="num">{formatCurrency(Number(row.Collected || 0))}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
