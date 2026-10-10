import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  Eye,
  MoreHorizontal,
  Pencil,
  Printer,
  Search,
  Trash2,
} from 'lucide-react'
import { localTodayIso } from '@shared/localDate'
import { invoiceNoLabel } from '@shared/billing/invoiceNumber'
import type { BillFormat, Invoice, PaymentMode, Pledge } from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable, TablePager } from '../../components/DataTable'
import { DateInput } from '../../components/DateInput'
import { FilterBar } from '../../components/FilterBar'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge, type StatusKind } from '../../components/StatusBadge'
import { useToast } from '../../components/toastContext'
import { formatCurrency, formatDisplayDate, formatPaymentMode } from '../../lib/format'
import { api } from '../../lib/api'
import {
  monthRange,
  type BillingPeriod,
  type DuePaidFilter,
} from './billingInsights'
import {
  BILLING_TAB_OPTIONS,
  saleDetailPathForFormat,
  salePathForFormat,
  type BillingType,
} from './billingType'
import { InvoicePreviewModal } from './InvoicePreviewModal'
import { billPrintPath } from './billingPrint'
import { downloadPrintPdf } from '../print/downloadPrintPdf'
import { PledgePreviewModal } from '../pledges/PledgePreviewModal'

const PAGE_SIZE_OPTIONS = [5, 10, 25]
const DEFAULT_PAGE_SIZE = 5

type SaleStatusChip = 'all' | 'draft' | 'estimate' | 'final' | 'cancelled'
type PledgeStatusChip = 'all' | 'draft' | 'active' | 'redeemed' | 'forfeited' | 'renewed'
type BillTypeFilter = 'all' | BillingType

type BillRow =
  | {
      kind: 'invoice'
      key: string
      id: number
      date: string
      billNo: string
      billNoHint?: string
      typeLabel: string
      billType: 'cash_bill' | 'tax_invoice'
      customerName: string
      customerPhone: string
      itemsLabel: string
      total: number
      paid: number
      balance: number
      paymentLabel: string
      statusKind: StatusKind
      statusLabel?: string
      isHistorical: boolean
      invoice: Invoice
    }
  | {
      kind: 'pledge'
      key: string
      id: number
      date: string
      billNo: string
      typeLabel: string
      billType: 'adagu'
      customerName: string
      customerPhone: string
      itemsLabel: string
      total: number
      paid: number
      balance: number
      paymentLabel: string
      statusKind: StatusKind
      statusLabel: string
      isHistorical: boolean
      pledge: Pledge
    }

function listStatus(invoice: Invoice): StatusKind {
  if (invoice.status === 'cancelled') return 'cancelled'
  if (invoice.isEstimate) return 'estimate'
  if (invoice.status === 'draft') return 'draft'
  if (invoice.balanceDue > 0) return 'due'
  return 'final'
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

function typeLabelFor(type: 'cash_bill' | 'tax_invoice' | 'adagu'): string {
  return BILLING_TAB_OPTIONS.find((tab) => tab.value === type)?.label ?? type
}

function invoiceToRow(invoice: Invoice): BillRow {
  const billType = invoice.billFormat === 'tax_invoice' ? 'tax_invoice' : 'cash_bill'
  const provisionalLabel = invoiceNoLabel(invoice.invoiceNo, invoice.isEstimate)
  return {
    kind: 'invoice',
    key: `invoice-${invoice.id}`,
    id: invoice.id,
    date: invoice.invoiceDate,
    billNo: provisionalLabel ?? invoice.invoiceNo,
    billNoHint: provisionalLabel ? invoice.invoiceNo : undefined,
    typeLabel: typeLabelFor(billType),
    billType,
    customerName: invoice.customerName,
    customerPhone: invoice.customerPhone,
    itemsLabel: itemCountLabel(invoice.itemCount ?? invoice.items?.length ?? 0),
    total: invoice.amountPayable ?? invoice.total,
    paid: invoice.amountPaid,
    balance: invoice.balanceDue,
    paymentLabel: invoice.amountPaid > 0 ? formatPaymentMode(invoice.paymentMode) : '-',
    statusKind: listStatus(invoice),
    isHistorical: Boolean(invoice.isHistorical),
    invoice,
  }
}

function pledgeToRow(pledge: Pledge): BillRow {
  const statusKind: StatusKind =
    pledge.status === 'redeemed' || pledge.status === 'renewed'
      ? 'paid'
      : pledge.status === 'forfeited'
        ? 'draft'
        : pledge.status === 'draft'
          ? 'draft'
          : 'due'
  const statusLabel =
    pledge.status === 'redeemed'
      ? 'Redeemed'
      : pledge.status === 'renewed'
        ? 'Renewed'
        : pledge.status === 'forfeited'
          ? 'Forfeited'
          : pledge.status === 'draft'
            ? 'Draft'
            : 'Active'
  return {
    kind: 'pledge',
    key: `pledge-${pledge.id}`,
    id: pledge.id,
    date: pledge.pledgeDate,
    billNo: pledge.receiptNo,
    typeLabel: typeLabelFor('adagu'),
    billType: 'adagu',
    customerName: pledge.customerName,
    customerPhone: pledge.customerPhone,
    itemsLabel: itemCountLabel(pledge.itemCount ?? pledge.items?.length ?? 0),
    total: pledge.loanAmount,
    paid: 0,
    balance: pledge.status === 'active' ? pledge.loanAmount : 0,
    paymentLabel: '-',
    statusKind,
    statusLabel,
    isHistorical: false,
    pledge,
  }
}

export function InvoicesPage() {
  const today = localTodayIso()
  const { showToast } = useToast()

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [pledges, setPledges] = useState<Pledge[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hasLoadedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [reprinting, setReprinting] = useState(false)
  const [period, setPeriod] = useState<BillingPeriod>('all')
  const [selectedDate, setSelectedDate] = useState(today)
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [billTypeFilter, setBillTypeFilter] = useState<BillTypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<SaleStatusChip>('all')
  const [pledgeStatus, setPledgeStatus] = useState<PledgeStatusChip>('all')
  const [duePaid, setDuePaid] = useState<DuePaidFilter>('all')
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentMode>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [previewInvoice, setPreviewInvoice] = useState<{
    id: number
    format: BillFormat
    invoiceNo: string
  } | null>(null)
  const [previewPledge, setPreviewPledge] = useState<{ id: number; receiptNo: string } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const adaguOnly = billTypeFilter === 'adagu'
  const showSaleStatusChips = !adaguOnly

  const range = useMemo(() => {
    if (period === 'all') return { from: null, to: null }
    if (period === 'month') return monthRange(selectedDate)
    return { from: selectedDate, to: selectedDate }
  }, [period, selectedDate])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (active) {
          setError(null)
          if (hasLoadedRef.current) setRefreshing(true)
          else setLoading(true)
        }
        const includeInvoices =
          billTypeFilter === 'all' || billTypeFilter === 'cash_bill' || billTypeFilter === 'tax_invoice'
        const includePledges =
          (billTypeFilter === 'all' || billTypeFilter === 'adagu') &&
          statusFilter === 'all' &&
          paymentFilter === 'all' &&
          duePaid === 'all'
        const format =
          billTypeFilter === 'cash_bill' || billTypeFilter === 'tax_invoice' ? billTypeFilter : 'all'
        const [invoicePage, pledgePage] = await Promise.all([
          includeInvoices
            ? api.listInvoices({
                page,
                pageSize,
                from: range.from,
                to: range.to,
                q: searchQuery || undefined,
                format,
                status: statusFilter,
                paymentMode: paymentFilter,
                duePaid,
                sort: dateSort,
              })
            : Promise.resolve({ items: [] as Invoice[], total: 0, page, pageSize }),
          includePledges
            ? api.listPledges({
                page,
                pageSize,
                from: range.from,
                to: range.to,
                q: searchQuery || undefined,
                status: adaguOnly ? pledgeStatus : 'all',
                sort: dateSort,
              })
            : Promise.resolve({ items: [] as Pledge[], total: 0, page, pageSize }),
        ])
        if (active) {
          setInvoices(invoicePage.items ?? [])
          setPledges(pledgePage.items ?? [])
          setTotalRows((invoicePage.total ?? 0) + (pledgePage.total ?? 0))
          hasLoadedRef.current = true
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load bills')
        }
      } finally {
        if (active) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [
    page,
    pageSize,
    range.from,
    range.to,
    searchQuery,
    billTypeFilter,
    statusFilter,
    pledgeStatus,
    paymentFilter,
    duePaid,
    dateSort,
    adaguOnly,
    reloadKey,
  ])

  useEffect(() => {
    if (menuKey === null) return
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuKey(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuKey])

  const visibleRows = useMemo(() => {
    const invoiceRows = (invoices ?? []).map(invoiceToRow)
    const pledgeRows = (pledges ?? []).map(pledgeToRow)
    const merged = [...invoiceRows, ...pledgeRows]
    const sorted = merged.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date) || a.id - b.id
      return dateSort === 'asc' ? cmp : -cmp
    })
    return billTypeFilter === 'all' ? sorted.slice(0, pageSize) : sorted
  }, [invoices, pledges, billTypeFilter, dateSort, pageSize])

  const lastPage = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, lastPage)

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage)
    }
  }, [page, currentPage])

  const pagedRows = visibleRows

  const allPageSelected =
    pagedRows.length > 0 && pagedRows.every((row) => selectedKeys.includes(row.key))

  function resetPage() {
    setPage(1)
  }

  function resetFilters() {
    setBillTypeFilter('all')
    setStatusFilter('all')
    setPledgeStatus('all')
    setPaymentFilter('all')
    setDuePaid('all')
    setPeriod('all')
    setSearch('')
    setSearchQuery('')
    setPage(1)
    setSelectedKeys([])
  }

  async function load() {
    setReloadKey((key) => key + 1)
  }

  async function remove(id: number) {
    try {
      setDeleting(true)
      await api.deleteInvoice(id)
      setSelectedKeys((keys) => keys.filter((key) => key !== `invoice-${id}`))
      showToast('Draft bill deleted', 'success')
      setDeleteId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bill')
    } finally {
      setDeleting(false)
    }
  }

  function printFormatFor(invoice: Invoice): BillFormat {
    return invoice.billFormat ?? 'cash_bill'
  }

  async function reprintLast() {
    try {
      setReprinting(true)
      setError(null)
      const settings = await api.getShopSettings()
      const invoiceId = settings.lastPrinted.invoiceId
      if (!invoiceId) {
        throw new Error('No bill has been printed yet.')
      }
      const format = settings.lastPrinted.billFormat || 'cash_bill'
      setPreviewInvoice({
        id: invoiceId,
        format,
        invoiceNo: settings.lastPrinted.invoiceNo || `bill-${invoiceId}`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reprint last bill')
    } finally {
      setReprinting(false)
    }
  }

  function printInvoice(invoice: Invoice) {
    setError(null)
    setPreviewInvoice({
      id: invoice.id,
      format: printFormatFor(invoice),
      invoiceNo: invoice.invoiceNo,
    })
  }

  function printPledge(pledge: Pledge) {
    setError(null)
    setPreviewPledge({ id: pledge.id, receiptNo: pledge.receiptNo })
  }

  async function exportPdf(invoice: Invoice) {
    setMenuKey(null)
    setError(null)
    try {
      const result = await downloadPrintPdf(
        billPrintPath(invoice.id, printFormatFor(invoice)),
        `${invoice.invoiceNo}.pdf`,
      )
      if (!result.canceled) showToast('PDF saved', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download PDF')
    }
  }

  function toggleSelected(key: string) {
    setSelectedKeys((keys) => (keys.includes(key) ? keys.filter((value) => value !== key) : [...keys, key]))
  }

  function togglePageSelected() {
    if (allPageSelected) {
      const pageKeys = new Set(pagedRows.map((row) => row.key))
      setSelectedKeys((keys) => keys.filter((key) => !pageKeys.has(key)))
      return
    }
    setSelectedKeys((keys) => [...new Set([...keys, ...pagedRows.map((row) => row.key)])])
  }

  return (
    <div className="app-page billing-page app-page-fill">
      <header className="page-header app-page-header billing-page-header">
        <div>
          <h1>Billing</h1>
          <p className="page-subtitle muted">Create, manage and track all your bills</p>
        </div>
        <div className="toolbar page-header-actions billing-header-tools">
          <label className="billing-search">
            <Search size={16} strokeWidth={2} aria-hidden />
            <input
              className="input"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPage()
              }}
              placeholder="Search bills, customer, mobile..."
            />
          </label>
          <DateInput
            className="input"
            value={selectedDate}
            showIcon
            ariaLabel="Billing date"
            onChange={(value) => {
              setSelectedDate(value || today)
              resetPage()
            }}
          />
        </div>
      </header>

      {refreshing ? <p className="muted list-refreshing-hint">Updating…</p> : null}

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          header={
            <div className="billing-toolbar">
              {showSaleStatusChips ? (
                <FilterBar
                  value={statusFilter}
                  onChange={(value) => {
                    setStatusFilter(value)
                    resetPage()
                  }}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'estimate', label: 'Estimate' },
                    { value: 'final', label: 'Final' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                />
              ) : (
                <FilterBar
                  value={pledgeStatus}
                  onChange={(value) => {
                    setPledgeStatus(value)
                    resetPage()
                  }}
                  options={[
                    { value: 'all', label: `All (${pledges.length})` },
                    {
                      value: 'draft',
                      label: `Draft (${pledges.filter((p) => p.status === 'draft').length})`,
                    },
                    {
                      value: 'active',
                      label: `Active (${pledges.filter((p) => p.status === 'active').length})`,
                    },
                    {
                      value: 'redeemed',
                      label: `Redeemed (${pledges.filter((p) => p.status === 'redeemed').length})`,
                    },
                    {
                      value: 'forfeited',
                      label: `Forfeited (${pledges.filter((p) => p.status === 'forfeited').length})`,
                    },
                    {
                      value: 'renewed',
                      label: `Renewed (${pledges.filter((p) => p.status === 'renewed').length})`,
                    },
                  ]}
                />
              )}
              <button
                type="button"
                className="btn secondary"
                disabled={reprinting}
                onClick={() => void reprintLast()}
              >
                <Printer size={16} strokeWidth={1.75} aria-hidden />
                Reprint last
              </button>
              <div className="billing-toolbar-filters">
                <label className="billing-filter-field">
                  <select
                    className="input"
                    value={billTypeFilter}
                    aria-label="Bill type"
                    onChange={(event) => {
                      setBillTypeFilter(event.target.value as BillTypeFilter)
                      setStatusFilter('all')
                      setPledgeStatus('all')
                      resetPage()
                    }}
                  >
                    <option value="all">Type All</option>
                    <option value="cash_bill">Quotation</option>
                    <option value="tax_invoice">Tax Invoice</option>
                    <option value="adagu">Adagu Bill</option>
                  </select>
                </label>
                <label className="billing-filter-field billing-period-field">
                  <Calendar size={15} strokeWidth={2} aria-hidden />
                  <select
                    className="input"
                    value={period}
                    aria-label="Period"
                    onChange={(event) => {
                      setPeriod(event.target.value as BillingPeriod)
                      resetPage()
                    }}
                  >
                    <option value="today">Today</option>
                    <option value="month">This month</option>
                    <option value="all">All</option>
                  </select>
                </label>
                {!adaguOnly ? (
                  <>
                    <label className="billing-filter-field">
                      <select
                        className="input"
                        value={paymentFilter}
                        aria-label="Payment"
                        onChange={(event) => {
                          setPaymentFilter(event.target.value as 'all' | PaymentMode)
                          resetPage()
                        }}
                      >
                        <option value="all">Payment All</option>
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        <option value="mixed">Mixed</option>
                      </select>
                    </label>
                    <label className="billing-filter-field">
                      <select
                        className="input"
                        value={duePaid}
                        aria-label="Due status"
                        onChange={(event) => {
                          setDuePaid(event.target.value as DuePaidFilter)
                          resetPage()
                        }}
                      >
                        <option value="all">Status All</option>
                        <option value="due">Due</option>
                        <option value="paid">Paid</option>
                      </select>
                    </label>
                  </>
                ) : null}
                <button type="button" className="btn secondary" onClick={resetFilters}>
                  Reset
                </button>
              </div>
            </div>
          }
          footer={
            totalRows === 0 ? undefined : (
              <TablePager
                page={currentPage}
                pageSize={pageSize}
                total={totalRows}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                itemLabel="bills"
              />
            )
          }
        >
          <table>
            <thead>
              <tr>
                <th className="billing-check-col">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePageSelected}
                    aria-label="Select all bills on this page"
                  />
                </th>
                <th>Bill No.</th>
                <th>
                  <button
                    type="button"
                    className="billing-sort"
                    onClick={() => setDateSort((value) => (value === 'desc' ? 'asc' : 'desc'))}
                  >
                    Date
                    <span aria-hidden>{dateSort === 'desc' ? ' ↓' : ' ↑'}</span>
                  </button>
                </th>
                <th>Type</th>
                <th>Customer</th>
                <th>Items</th>
                <th className="num">Total Amount</th>
                <th className="num">Paid</th>
                <th className="num">Balance</th>
                <th>Payment</th>
                <th>Status</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {totalRows === 0 ? (
                <tr>
                  <td colSpan={12} className="empty-cell">
                    No bills found. Create your first bill to get started.
                  </td>
                </tr>
              ) : null}
              {pagedRows.map((row) => {
                if (row.kind === 'pledge') {
                  const viewPath = `/billing/adagu/${row.pledge.id}`
                  return (
                    <tr key={row.key}>
                      <td className="billing-check-col">
                        <input
                          type="checkbox"
                          checked={selectedKeys.includes(row.key)}
                          onChange={() => toggleSelected(row.key)}
                          aria-label={`Select ${row.billNo}`}
                        />
                      </td>
                      <td>
                        <Link to={viewPath} className="billing-bill-no">
                          {row.billNo}
                        </Link>
                      </td>
                      <td>{formatDisplayDate(row.date)}</td>
                      <td>{row.typeLabel}</td>
                      <td>
                        <span className="billing-customer-name">{row.customerName}</span>
                        {row.customerPhone ? (
                          <span className="cell-hint">{row.customerPhone}</span>
                        ) : null}
                      </td>
                      <td>{row.itemsLabel}</td>
                      <td className="num">{formatCurrency(row.total)}</td>
                      <td className="num">-</td>
                      <td className="num">
                        {row.pledge.status === 'active' ? formatCurrency(row.balance) : '-'}
                      </td>
                      <td>{row.paymentLabel}</td>
                      <td>
                        <StatusBadge kind={row.statusKind} label={row.statusLabel} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <Link
                            to={viewPath}
                            className="btn ghost billing-icon-btn"
                            aria-label={`Open ${row.billNo}`}
                          >
                            {row.pledge.status === 'active' || row.pledge.status === 'draft' ? (
                              <Pencil size={16} strokeWidth={1.75} />
                            ) : (
                              <Eye size={16} strokeWidth={1.75} />
                            )}
                          </Link>
                          <button
                            type="button"
                            className="btn ghost billing-icon-btn"
                            aria-label={`Print ${row.billNo}`}
                            onClick={() => printPledge(row.pledge)}
                          >
                            <Printer size={16} strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                const invoice = row.invoice
                const saleType = row.billType
                const editPath = salePathForFormat(saleType, invoice.id)
                const detailPath = saleDetailPathForFormat(saleType, invoice.id)
                const viewPath = invoice.status === 'draft' ? editPath : detailPath
                return (
                  <tr key={row.key}>
                    <td className="billing-check-col">
                      <input
                        type="checkbox"
                        checked={selectedKeys.includes(row.key)}
                        onChange={() => toggleSelected(row.key)}
                        aria-label={`Select ${row.billNo}`}
                      />
                    </td>
                    <td>
                      <Link to={viewPath} className="billing-bill-no">
                        {row.billNo}
                      </Link>
                      {row.billNoHint ? <span className="cell-hint">{row.billNoHint}</span> : null}
                    </td>
                    <td>{formatDisplayDate(row.date)}</td>
                    <td>{row.typeLabel}</td>
                    <td>
                      <span className="billing-customer-name">{row.customerName}</span>
                      {row.customerPhone ? (
                        <span className="cell-hint">{row.customerPhone}</span>
                      ) : null}
                    </td>
                    <td>{row.itemsLabel}</td>
                    <td className="num">{formatCurrency(row.total)}</td>
                    <td className="num">{formatCurrency(row.paid)}</td>
                    <td className={`num${row.balance > 0 ? ' due-amount' : ''}`}>
                      {formatCurrency(row.balance)}
                    </td>
                    <td>{row.paymentLabel}</td>
                    <td>
                      <StatusBadge kind={row.statusKind} />
                      {row.isHistorical ? (
                        <span className="badge draft billing-old-badge">Old</span>
                      ) : null}
                    </td>
                    <td>
                      <div className="row-actions">
                        {invoice.status === 'draft' && !invoice.isEstimate ? (
                          <Link
                            to={editPath}
                            className="btn ghost billing-icon-btn"
                            aria-label={`Edit ${row.billNo}`}
                          >
                            <Pencil size={16} strokeWidth={1.75} />
                          </Link>
                        ) : (
                          <Link
                            to={detailPath}
                            className="btn ghost billing-icon-btn"
                            aria-label={`View ${row.billNo}`}
                          >
                            <Eye size={16} strokeWidth={1.75} />
                          </Link>
                        )}
                        <button
                          type="button"
                          className="btn ghost billing-icon-btn"
                          aria-label={`Print ${row.billNo}`}
                          onClick={() => printInvoice(invoice)}
                        >
                          <Printer size={16} strokeWidth={1.75} />
                        </button>
                        {invoice.status === 'draft' && !invoice.isEstimate ? (
                          <button
                            type="button"
                            className="btn ghost billing-icon-btn billing-icon-danger"
                            aria-label={`Delete ${row.billNo}`}
                            onClick={() => setDeleteId(invoice.id)}
                          >
                            <Trash2 size={16} strokeWidth={1.75} />
                          </button>
                        ) : (
                          <div
                            className="billing-menu"
                            ref={menuKey === row.key ? menuRef : undefined}
                          >
                            <button
                              type="button"
                              className="btn ghost billing-icon-btn"
                              aria-label={`More actions for ${row.billNo}`}
                              aria-expanded={menuKey === row.key}
                              onClick={() =>
                                setMenuKey((current) => (current === row.key ? null : row.key))
                              }
                            >
                              <MoreHorizontal size={16} strokeWidth={1.75} />
                            </button>
                            {menuKey === row.key ? (
                              <div className="billing-menu-pop" role="menu">
                                <Link to={detailPath} role="menuitem" onClick={() => setMenuKey(null)}>
                                  View
                                </Link>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => void exportPdf(invoice)}
                                >
                                  Export PDF
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataTable>
      )}

      {deleteId !== null && (
        <ConfirmDialog
          title="Delete draft bill"
          message="Delete this draft bill?"
          busy={deleting}
          onCancel={() => setDeleteId(null)}
          onConfirm={() => void remove(deleteId)}
        />
      )}

      {previewInvoice && (
        <InvoicePreviewModal
          invoiceId={previewInvoice.id}
          initialFormat={previewInvoice.format}
          pdfFilename={`${previewInvoice.invoiceNo}.pdf`}
          onClose={() => setPreviewInvoice(null)}
        />
      )}

      {previewPledge ? (
        <PledgePreviewModal
          pledgeId={previewPledge.id}
          pdfFilename={`${previewPledge.receiptNo}.pdf`}
          onClose={() => setPreviewPledge(null)}
        />
      ) : null}
    </div>
  )
}
