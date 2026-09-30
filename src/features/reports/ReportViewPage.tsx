import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  findReport,
  REPORT_GROUPS,
  type ReportColumn,
  type ReportDefinition,
  type ReportResult,
} from '@shared/reportsCatalog'
import { PageHeader } from '../../components/PageHeader'
import { DateInput } from '../../components/DateInput'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../lib/format'
import { useReportLookups } from './ReportsLayout'

function todayIso(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthStart(today: string): string {
  return `${today.slice(0, 7)}-01`
}

function defaultFrom(report: ReportDefinition, today: string): string {
  if (report.defaultToday || report.dateScope !== 'range') return today
  return monthStart(today)
}

function formatCell(column: ReportColumn, value: string | number): string {
  if (column.format === 'money') return formatCurrency(Number(value) || 0)
  if (column.format === 'weight') return formatWeight(Number(value) || 0)
  if (column.format === 'date') return value ? formatDisplayDate(String(value)) : '—'
  if (column.format === 'qty') return new Intl.NumberFormat('en-IN').format(Number(value) || 0)
  return value === '' ? '—' : String(value)
}

function csvCell(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function ReportViewPage() {
  const { reportId = '' } = useParams()
  const report = findReport(reportId)
  if (!report) {
    return (
      <div className="app-page">
        <PageHeader title="Report" subtitle="This report is not in the catalogue." />
      </div>
    )
  }
  return <ReportPanel key={report.id} report={report} />
}

function ReportPanel({ report }: { report: ReportDefinition }) {
  const lookups = useReportLookups()
  const [from, setFrom] = useState(() => defaultFrom(report, todayIso()))
  const [to, setTo] = useState(() => todayIso())
  const [customerId, setCustomerId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [productId, setProductId] = useState('')
  const [metal, setMetal] = useState('')
  const [qtyCutoff, setQtyCutoff] = useState('1')
  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!report?.available) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const asOf = report.dateScope === 'asOf'
    void api
      .runReport(report.id, {
        from: report.dateScope === 'none' ? undefined : asOf ? to : from,
        to: report.dateScope === 'none' ? undefined : to,
        customerId: customerId ? Number(customerId) : undefined,
        supplierId: supplierId ? Number(supplierId) : undefined,
        productId: productId ? Number(productId) : undefined,
        metal: metal || undefined,
        qtyCutoff: report.filters.includes('qtyCutoff') ? Number(qtyCutoff) || 0 : undefined,
      })
      .then((data) => {
        if (!cancelled) setResult(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult(null)
          setError(err instanceof Error ? err.message : 'Failed to load report')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [report, from, to, customerId, supplierId, productId, metal, qtyCutoff])

  const group = REPORT_GROUPS.find((item) => item.id === report.group)

  function exportCsv() {
    if (!result) return
    const header = result.columns.map((column) => csvCell(column.label)).join(',')
    const lines = result.rows.map((row) =>
      result.columns.map((column) => csvCell(row[column.key] ?? '')).join(','),
    )
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${report.id}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-page">
      <PageHeader
        title={report.title}
        subtitle={group?.label}
        actions={
          report.available ? (
            <button type="button" className="btn secondary" onClick={exportCsv} disabled={!result}>
              Export CSV
            </button>
          ) : null
        }
      />
      {report.note ? <p className="reports-note">{report.note}</p> : null}
      {!report.available ? (
        <div className="card padded reports-unavailable">
          <p>{report.unavailableReason}</p>
        </div>
      ) : (
        <>
          <div className="filter-bar reports-filters">
            {report.dateScope === 'range' ? (
              <>
                <label>
                  From
                  <DateInput className="input" value={from} onChange={setFrom} />
                </label>
                <label>
                  To
                  <DateInput className="input" value={to} onChange={setTo} />
                </label>
              </>
            ) : null}
            {report.dateScope === 'asOf' ? (
              <label>
                As of
                <DateInput className="input" value={to} onChange={setTo} />
              </label>
            ) : null}
            {report.filters.includes('customer') ? (
              <label>
                Customer
                <select className="select" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">All customers</option>
                  {lookups.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {report.filters.includes('supplier') ? (
              <label>
                Supplier
                <select className="select" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                  <option value="">All suppliers</option>
                  {lookups.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {report.filters.includes('product') ? (
              <label>
                Product
                <select className="select" value={productId} onChange={(event) => setProductId(event.target.value)}>
                  <option value="">All products</option>
                  {lookups.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {report.filters.includes('metal') ? (
              <label>
                Metal
                <select className="select" value={metal} onChange={(event) => setMetal(event.target.value)}>
                  <option value="">All metals</option>
                  <option value="Gold">Gold</option>
                  <option value="Silver">Silver</option>
                </select>
              </label>
            ) : null}
            {report.filters.includes('qtyCutoff') ? (
              <label>
                Qty at or below
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={qtyCutoff}
                  onChange={(event) => setQtyCutoff(event.target.value)}
                />
              </label>
            ) : null}
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          {loading ? <p className="muted">Loading report…</p> : null}
          {result ? (
            <div className="card table-wrap">
              <table className="reports-table">
                <thead>
                  <tr>
                    {result.columns.map((column) => (
                      <th key={column.key} className={column.align === 'right' ? 'num' : undefined}>
                        {column.label}
                      </th>
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
                      <tr key={`${report.id}-${index}`}>
                        {result.columns.map((column) => (
                          <td key={column.key} className={column.align === 'right' ? 'num' : undefined}>
                            {formatCell(column, row[column.key] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
                {result.rows.length > 0 && Object.keys(result.totals).length > 0 ? (
                  <tfoot>
                    <tr>
                      {result.columns.map((column, index) => (
                        <td key={column.key} className={column.align === 'right' ? 'num' : undefined}>
                          {index === 0 && !column.total
                            ? 'Total'
                            : column.total
                              ? formatCell(column, result.totals[column.key] ?? 0)
                              : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
