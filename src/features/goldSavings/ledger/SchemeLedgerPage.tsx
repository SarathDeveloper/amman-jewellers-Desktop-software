import { useEffect, useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import type { GoldSavingAccount, GoldSavingLedgerEntry } from '@shared/types'
import { DateInput } from '../../../components/DateInput'
import { DataTable } from '../../../components/DataTable'
import { FilterBar } from '../../../components/FilterBar'
import { PageHeader } from '../../../components/PageHeader'
import { SearchBar } from '../../../components/SearchBar'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../../lib/format'
import { api } from '../../../lib/api'
import { PrintPreviewModal } from '../../print/PrintPreviewModal'
import { GsAccountSearch } from '../GsAccountSearch'
import { GsStatusBadge } from '../GsStatusBadge'
import { formatGsPaymentMode } from '../gsLabels'

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'payment', label: 'Payment' },
  { value: 'reversal', label: 'Reversal' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'redemption', label: 'Redemption' },
  { value: 'posted', label: 'Posted' },
] as const

export function SchemeLedgerPage() {
  const [account, setAccount] = useState<GoldSavingAccount | null>(null)
  const [rows, setRows] = useState<GoldSavingLedgerEntry[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]['value']>('all')
  const [search, setSearch] = useState('')
  const [printPassbook, setPrintPassbook] = useState(false)

  useEffect(() => {
    if (!account) return
    void api.getGsLedger(account.id, { from: from || undefined, to: to || undefined }).then(setRows)
  }, [account, from, to])

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (status !== 'all' && row.entryType !== status && row.paymentStatus !== status) return false
      if (search && !`${row.receiptNo} ${row.txnRef}`.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [rows, status, search])

  function exportCsv() {
    const header = ['Month', 'Date', 'Receipt', 'Amount', 'Gold rate', 'Gold weight', 'Cumulative', 'Mode', 'Status']
    const lines = [
      header.join(','),
      ...filtered.map((row) =>
        [
          row.installmentNo ?? '',
          formatDisplayDate(row.entryDate),
          row.receiptNo,
          row.amount,
          row.goldRate,
          row.goldWeight,
          row.cumulativeGold,
          row.paymentMode,
          row.paymentStatus,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${account?.accountNo ?? 'ledger'}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title="Scheme ledger"
        subtitle="Ledger is the source of truth for accumulated gold"
        actions={
          account ? (
            <>
              <button type="button" className="btn secondary" onClick={exportCsv}>
                <Download size={16} strokeWidth={1.75} aria-hidden />
                Export
              </button>
              <button type="button" className="btn" onClick={() => setPrintPassbook(true)}>
                <Printer size={16} strokeWidth={1.75} aria-hidden />
                Print passbook
              </button>
            </>
          ) : null
        }
      />
      <section className="card padded card--search">
        <GsAccountSearch
          selected={account}
          onSelect={setAccount}
          onClear={() => {
            setAccount(null)
            setRows([])
          }}
        />
        <div className="filter-bar reports-filters">
          <label>
            From
            <DateInput className="input" value={from} onChange={setFrom} showIcon />
          </label>
          <label>
            To
            <DateInput className="input" value={to} onChange={setTo} showIcon />
          </label>
        </div>
        <FilterBar value={status} onChange={setStatus} options={[...STATUS_FILTERS]} />
        <SearchBar value={search} onChange={setSearch} placeholder="Search receipt..." />
      </section>
      {account ? (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>Month / Inst.</th>
                <th>Date</th>
                <th>Receipt</th>
                <th className="num">Amount</th>
                <th className="num">Gold rate</th>
                <th className="num">Gold weight</th>
                <th className="num">Cumulative</th>
                <th>Mode</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>{row.installmentNo ?? '—'}</td>
                  <td>{formatDisplayDate(row.entryDate)}</td>
                  <td>{row.receiptNo}</td>
                  <td className="num">{formatCurrency(row.amount)}</td>
                  <td className="num">{row.goldRate ? formatCurrency(row.goldRate) : '—'}</td>
                  <td className="num">{formatWeight(row.goldWeight, 3)}</td>
                  <td className="num">{formatWeight(row.cumulativeGold, 3)}</td>
                  <td>{row.paymentMode ? formatGsPaymentMode(row.paymentMode) : '—'}</td>
                  <td><GsStatusBadge status={row.paymentStatus || row.entryType} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      ) : null}
      {printPassbook && account ? (
        <PrintPreviewModal
          title="Scheme passbook"
          path={`/print/gs-passbook/${account.id}`}
          pdfFilename="gs-passbook.pdf"
          onClose={() => setPrintPassbook(false)}
        />
      ) : null}
    </div>
  )
}
