import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import type { GoldSavingReportId, GoldSavingReportResult, GoldSavingScheme } from '@shared/types'
import { DateInput } from '../../../components/DateInput'
import { PageHeader } from '../../../components/PageHeader'
import { formatDisplayDate } from '../../../lib/format'
import { api } from '../../../lib/api'

const REPORTS: { id: GoldSavingReportId; title: string }[] = [
  { id: 'daily-collections', title: 'Daily collections' },
  { id: 'monthly-collections', title: 'Monthly collections' },
  { id: 'customer-ledger', title: 'Customer ledger' },
  { id: 'scheme-performance', title: 'Scheme performance' },
  { id: 'active-schemes', title: 'Active schemes' },
  { id: 'matured-schemes', title: 'Matured schemes' },
  { id: 'overdue-installments', title: 'Overdue installments' },
  { id: 'cancelled-schemes', title: 'Cancelled schemes' },
  { id: 'gold-accumulation', title: 'Gold accumulation' },
  { id: 'redemption-history', title: 'Redemption history' },
  { id: 'outstanding-obligations', title: 'Outstanding obligations' },
]

const DATE_COLUMNS = new Set(['Date', 'Enrolled', 'Maturity', 'Due'])

function formatReportCell(column: string, value: string | number): string {
  if (DATE_COLUMNS.has(column) && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDisplayDate(value.slice(0, 10))
  }
  return String(value)
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

  useEffect(() => {
    void api.listGsSchemes().then(setSchemes)
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
          <DateInput className="input" value={from} onChange={setFrom} />
        </label>
        <label>
          To
          <DateInput className="input" value={to} onChange={setTo} />
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
