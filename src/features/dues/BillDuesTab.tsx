import { useMemo, useState } from 'react'
import type {
  Customer,
  CustomerDuesColumn,
  DueEntry,
  DueEntryInput,
  DueEntryKind,
  DueEntryUpdateInput,
  DuesLedger,
  PledgePaymentMode,
} from '@shared/types'
import { localTodayIso } from '@shared/localDate'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DateInput } from '../../components/DateInput'
import { DataTable, TablePager } from '../../components/DataTable'
import { Drawer } from '../../components/Drawer'
import { EmptyState } from '../../components/EmptyState'
import { FilterBar } from '../../components/FilterBar'
import { LoadingState } from '../../components/LoadingState'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/toastContext'
import { formatCurrency, formatDisplayDate, formatWeight, paginate, TABLE_PAGE_SIZE } from '../../lib/format'
import { api } from '../../lib/api'
import { daysBetween, oldestDueDate } from '../dashboard/dashboardStats'
import { monthRange } from '../invoices/billingInsights'
import {
  billColumns,
  firstCollectableDue,
  lastPaymentDate,
  productSummary,
  remainingBalance,
  runningBalances,
  totalNetWeight,
} from './duesHelpers'
import { PLEDGE_PAYMENT_MODES } from './pledgePaymentModes'

type DueFilter = 'all' | 'overdue' | 'due' | 'paid' | 'month'

/** Bill payments never use the internal pledge modes. */
const BILL_PAYMENT_MODES = PLEDGE_PAYMENT_MODES.filter(
  (option) => option.value !== 'transfer' && option.value !== 'auction',
)

const emptyEntry: DueEntryInput = {
  customerId: 0,
  entryDate: localTodayIso(),
  kind: 'due',
  amount: 0,
  note: '',
}

export function BillDuesTab({
  ledger,
  loading,
  error,
  onError,
  onReload,
}: {
  ledger: DuesLedger
  loading: boolean
  error: string | null
  onError: (message: string | null) => void
  onReload: () => Promise<DuesLedger>
}) {
  const { showToast } = useToast()
  const today = localTodayIso()
  const month = monthRange(today)
  const [filter, setFilter] = useState<DueFilter>('all')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<DueEntryInput>(emptyEntry)
  const [editForm, setEditForm] = useState<DueEntryUpdateInput | null>(null)
  const [detail, setDetail] = useState<{ column: CustomerDuesColumn; entry: DueEntry } | null>(null)
  const [drawerColumn, setDrawerColumn] = useState<CustomerDuesColumn | null>(null)
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [paymentDate, setPaymentDate] = useState(localTodayIso())
  const [paymentNote, setPaymentNote] = useState('')
  const [paymentMode, setPaymentMode] = useState<PledgePaymentMode>('cash')
  const [settling, setSettling] = useState(false)
  const [entryBusy, setEntryBusy] = useState(false)
  const [deleteEntry, setDeleteEntry] = useState<DueEntry | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [recordCustomerId, setRecordCustomerId] = useState(0)
  const [recordAmount, setRecordAmount] = useState(0)
  const [recordDate, setRecordDate] = useState(localTodayIso())
  const [recordNote, setRecordNote] = useState('')
  const [recordMode, setRecordMode] = useState<PledgePaymentMode>('cash')

  const columns = useMemo(() => billColumns(ledger.columns), [ledger.columns])

  const rows = useMemo(() => {
    return columns
      .map((column) => {
        const oldest = oldestDueDate(column.entries)
        const days = oldest ? daysBetween(oldest, today) : 0
        return { column, days, lastPayment: lastPaymentDate(column.entries) }
      })
      .filter(({ column, days }) => {
        if (filter === 'paid') return column.balance <= 0
        if (filter === 'due') return column.balance > 0 && days < 30
        if (filter === 'overdue') return column.balance > 0 && days >= 30
        if (filter === 'month') {
          return column.entries.some((entry) => {
            const key = entry.entryDate.slice(0, 10)
            return key >= month.from && key <= month.to
          })
        }
        return true
      })
  }, [columns, filter, today, month.from, month.to])

  const paged = useMemo(() => paginate(rows, page, TABLE_PAGE_SIZE), [rows, page])

  async function openAddEntry() {
    try {
      onError(null)
      const list = await api.listCustomers()
      setCustomers(list)
      setForm({
        ...emptyEntry,
        entryDate: localTodayIso(),
        customerId: list[0]?.id ?? 0,
      })
      setOpen(true)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load customers')
    }
  }

  async function openRecordPayment() {
    try {
      const list = await api.listCustomers()
      setCustomers(list)
      const first = columns.find((column) => column.balance > 0)
      setRecordCustomerId(first?.customerId ?? list[0]?.id ?? 0)
      setRecordAmount(first?.balance ?? 0)
      setRecordDate(localTodayIso())
      setRecordMode('cash')
      setRecordNote('')
      setRecordOpen(true)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load customers')
    }
  }

  async function saveRecordPayment() {
    const column = columns.find((item) => item.customerId === recordCustomerId)
    const entry = column ? firstCollectableDue(column) : null
    if (!column || !entry || recordAmount <= 0) {
      onError('Select a customer with an outstanding due')
      return
    }
    try {
      setSettling(true)
      await api.recordDuePayment({
        dueEntryId: entry.id,
        amount: recordAmount,
        entryDate: recordDate,
        note: recordNote,
        mode: recordMode,
      })
      setRecordOpen(false)
      showToast('Payment recorded', 'success')
      await onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setSettling(false)
    }
  }

  async function saveEntry() {
    if (!form.customerId) {
      onError('Select a customer')
      return
    }
    if (form.amount <= 0) {
      onError('Enter an amount greater than zero')
      return
    }
    try {
      onError(null)
      setEntryBusy(true)
      await api.createDueEntry(form)
      setOpen(false)
      showToast('Entry added', 'success')
      await onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save entry')
    } finally {
      setEntryBusy(false)
    }
  }

  function openEditEntry(entry: DueEntry) {
    setEditForm({
      id: entry.id,
      entryDate: entry.entryDate,
      kind: entry.kind,
      amount: entry.amount,
      note: entry.note,
    })
    setEditOpen(true)
  }

  async function saveEditEntry() {
    if (!editForm || editForm.amount <= 0) {
      onError('Enter an amount greater than zero')
      return
    }
    try {
      onError(null)
      setEntryBusy(true)
      await api.updateDueEntry(editForm)
      setEditOpen(false)
      setEditForm(null)
      showToast('Entry updated', 'success')
      await onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update entry')
    } finally {
      setEntryBusy(false)
    }
  }

  async function removeEntry(entry: DueEntry) {
    try {
      onError(null)
      setEntryBusy(true)
      await api.deleteDueEntry(entry.id)
      setDeleteEntry(null)
      showToast('Entry removed', 'success')
      await onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete entry')
    } finally {
      setEntryBusy(false)
    }
  }

  function openPaymentDetail(column: CustomerDuesColumn, entry: DueEntry) {
    const remaining = remainingBalance(entry, column.balance)
    setDetail({ column, entry })
    setPaymentAmount(remaining)
    setPaymentDate(localTodayIso())
    setPaymentNote('')
    setPaymentMode('cash')
  }

  function refreshDetail(data: DuesLedger, dueEntryId: number, customerId: number) {
    const column = billColumns(data.columns).find((item) => item.customerId === customerId)
    const entry = column?.entries.find((item) => item.id === dueEntryId)
    if (column && entry) {
      setDetail({ column, entry })
      setPaymentAmount(remainingBalance(entry, column.balance))
      setDrawerColumn(column)
    } else {
      setDetail(null)
    }
  }

  async function recordPayment() {
    if (!detail || paymentAmount <= 0) {
      onError('Enter a payment amount greater than zero')
      return
    }
    try {
      setSettling(true)
      onError(null)
      await api.recordDuePayment({
        dueEntryId: detail.entry.id,
        amount: paymentAmount,
        entryDate: paymentDate,
        note: paymentNote,
        mode: paymentMode,
      })
      const data = await onReload()
      refreshDetail(data, detail.entry.id, detail.column.customerId)
      setPaymentNote('')
      setPaymentMode('cash')
      showToast('Payment recorded', 'success')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setSettling(false)
    }
  }

  async function markPaid() {
    if (!detail) return
    try {
      setSettling(true)
      onError(null)
      await api.markDuePaid(detail.entry.id)
      const data = await onReload()
      refreshDetail(data, detail.entry.id, detail.column.customerId)
      showToast('Marked as paid', 'success')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to mark as paid')
    } finally {
      setSettling(false)
    }
  }

  const detailRemaining = detail ? remainingBalance(detail.entry, detail.column.balance) : 0
  const detailPayments =
    detail?.entry.invoiceId != null
      ? detail.column.entries.filter(
          (entry) => entry.invoiceId === detail.entry.invoiceId && entry.kind === 'payment',
        )
      : detail
        ? detail.column.entries.filter((entry) => entry.kind === 'payment' && !entry.invoiceId && !entry.pledgeId)
        : []

  return (
    <div className="dues-tab-panel-inner">
      <div className="dues-tab-actions">
        <button type="button" className="btn secondary" onClick={() => void openAddEntry()}>
          Add entry
        </button>
        <button type="button" className="btn" onClick={() => void openRecordPayment()}>
          Record Payment
        </button>
      </div>

      <FilterBar
        value={filter}
        onChange={(value) => {
          setFilter(value)
          setPage(1)
        }}
        options={[
          { value: 'all', label: 'All' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'due', label: 'Due' },
          { value: 'month', label: 'This Month' },
          { value: 'paid', label: 'Paid' },
        ]}
      />

      {loading && !error ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState title="No outstanding dues" description="All cash and invoice payments are up to date." />
      ) : (
        <DataTable footer={<TablePager page={page} total={rows.length} onPageChange={setPage} />}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Customer</th>
                <th>Phone</th>
                <th className="num">Balance</th>
                <th>Oldest Due</th>
                <th>Last Payment</th>
                <th>Days Outstanding</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(({ column, days, lastPayment }, index) => {
                const collectable = firstCollectableDue(column)
                return (
                  <tr key={column.customerId}>
                    <td>{String((page - 1) * TABLE_PAGE_SIZE + index + 1).padStart(2, '0')}</td>
                    <td>
                      <button type="button" className="btn ghost" onClick={() => setDrawerColumn(column)}>
                        {column.customerName}
                      </button>
                    </td>
                    <td>{column.customerPhone}</td>
                    <td className={`num ${column.balance > 0 ? 'due-amount' : 'paid-amount'}`}>
                      {formatCurrency(column.balance)}
                    </td>
                    <td>{days > 0 ? `${days} days` : '—'}</td>
                    <td>{lastPayment ? formatDisplayDate(lastPayment) : '—'}</td>
                    <td className="num">{days}</td>
                    <td>
                      <div className="row-actions">
                        {collectable ? (
                          <>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => openPaymentDetail(column, collectable)}
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              className="btn ghost collect-btn"
                              onClick={() => openPaymentDetail(column, collectable)}
                            >
                              Collect
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataTable>
      )}

      {drawerColumn && (
        <Drawer title={drawerColumn.customerName} onClose={() => setDrawerColumn(null)}>
          <p className="muted">{drawerColumn.customerPhone}</p>
          <ul className="dues-lines">
            {drawerColumn.entries.map((entry, index) => {
              const balances = runningBalances(drawerColumn.entries)
              const summary = productSummary(entry)
              const weight = totalNetWeight(entry)
              return (
                <li key={entry.id} className="dues-line">
                  <div className="dues-line-main">
                    <span className={`dues-kind dues-kind-${entry.kind}`}>
                      {entry.kind === 'due' ? 'Due' : 'Paid'}
                    </span>
                    <span className="dues-amount num">
                      {entry.kind === 'payment' ? '− ' : ''}
                      {formatCurrency(entry.amount)}
                    </span>
                  </div>
                  {summary ? <span className="dues-product">{summary}</span> : null}
                  {weight > 0 ? <span className="dues-weight">{formatWeight(weight)}</span> : null}
                  {entry.invoiceId ? <span className="dues-badge">Auto · {entry.invoiceNo ?? 'Bill'}</span> : null}
                  {entry.note ? <span className="dues-note">{entry.note}</span> : null}
                  <span className="dues-running num">Bal {formatCurrency(balances[index])}</span>
                  <div className="dues-line-actions">
                    {entry.kind === 'due' ? (
                      <button
                        type="button"
                        className="btn ghost dues-remove"
                        onClick={() => openPaymentDetail(drawerColumn, entry)}
                      >
                        Details
                      </button>
                    ) : null}
                    <button type="button" className="btn ghost dues-remove" onClick={() => openEditEntry(entry)}>
                      Edit
                    </button>
                    <button type="button" className="btn ghost dues-remove" onClick={() => setDeleteEntry(entry)}>
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Drawer>
      )}

      {detail && (
        <Modal
          title="Payment detail"
          onClose={() => setDetail(null)}
          footer={
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setDetail(null)}>
                Close
              </button>
              {detailRemaining > 0 && paymentAmount >= detailRemaining ? (
                <button type="button" className="btn" disabled={settling} onClick={() => void markPaid()}>
                  Mark paid
                </button>
              ) : detailRemaining > 0 ? (
                <button
                  type="button"
                  className="btn"
                  disabled={settling || paymentAmount <= 0 || paymentAmount >= detailRemaining}
                  onClick={() => void recordPayment()}
                >
                  Record payment
                </button>
              ) : null}
            </div>
          }
        >
          <div className="dues-detail">
            <div className="dues-detail-header">
              <div>
                <h3 className="dues-detail-customer">{detail.column.customerName}</h3>
                {detail.column.customerPhone ? (
                  <p className="muted">Phone: {detail.column.customerPhone}</p>
                ) : null}
              </div>
            </div>
            {detail.entry.invoiceNo ? (
              <p className="dues-detail-bill">
                Bill {detail.entry.invoiceNo}
                {detail.entry.entryDate ? ` · ${formatDisplayDate(detail.entry.entryDate)}` : ''}
              </p>
            ) : null}
            {detail.entry.items.length > 0 ? (
              <table className="dues-detail-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Weight</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.entry.items.map((item, index) => (
                    <tr key={`${item.productName}-${index}`}>
                      <td>{item.productName}</td>
                      <td className="num">{formatWeight(item.netWeight)}</td>
                      <td className="num">{formatCurrency(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No linked products for this entry.</p>
            )}
            <dl className="dues-detail-totals">
              <div>
                <dt>Balance</dt>
                <dd className="num">{formatCurrency(detailRemaining)}</dd>
              </div>
            </dl>
            {detailPayments.length > 0 ? (
              <div className="dues-detail-history">
                <h4>Payment history</h4>
                <ul>
                  {detailPayments.map((payment) => (
                    <li key={payment.id}>
                      <span>{formatDisplayDate(payment.entryDate)}</span>
                      <span className="num">− {formatCurrency(payment.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {detailRemaining > 0 ? (
              <div className="dues-detail-pay form-grid">
                <label>
                  Payment date
                  <DateInput className="input" value={paymentDate} onChange={setPaymentDate} />
                </label>
                <label>
                  Amount
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    max={detailRemaining}
                    value={paymentAmount || ''}
                    onChange={(event) => setPaymentAmount(Number(event.target.value) || 0)}
                  />
                </label>
                <label>
                  Payment mode
                  <select
                    className="select"
                    value={paymentMode}
                    onChange={(event) => setPaymentMode(event.target.value as PledgePaymentMode)}
                  >
                    {BILL_PAYMENT_MODES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="full">
                  Note
                  <input
                    className="input"
                    placeholder="Optional"
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                  />
                </label>
              </div>
            ) : null}
          </div>
        </Modal>
      )}

      {recordOpen && (
        <Modal
          title="Record Payment"
          onClose={() => setRecordOpen(false)}
          footer={
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setRecordOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn" disabled={settling} onClick={() => void saveRecordPayment()}>
                Record Payment
              </button>
            </div>
          }
        >
          <div className="form-grid">
            <label className="full">
              Customer
              <select
                className="select"
                value={recordCustomerId}
                onChange={(event) => {
                  const id = Number(event.target.value)
                  setRecordCustomerId(id)
                  const column = columns.find((item) => item.customerId === id)
                  setRecordAmount(column?.balance ?? 0)
                }}
              >
                {columns
                  .filter((column) => column.balance > 0)
                  .map((column) => (
                    <option key={column.customerId} value={column.customerId}>
                      {column.customerName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Outstanding Amount
              <input
                className="input"
                readOnly
                value={formatCurrency(columns.find((column) => column.customerId === recordCustomerId)?.balance ?? 0)}
              />
            </label>
            <label>
              Payment Amount
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={recordAmount || ''}
                onChange={(event) => setRecordAmount(Number(event.target.value) || 0)}
              />
            </label>
            <label>
              Date
              <DateInput className="input" value={recordDate} onChange={setRecordDate} />
            </label>
            <label>
              Payment mode
              <select
                className="select"
                value={recordMode}
                onChange={(event) => setRecordMode(event.target.value as PledgePaymentMode)}
              >
                {BILL_PAYMENT_MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Note
              <input className="input" value={recordNote} onChange={(event) => setRecordNote(event.target.value)} />
            </label>
          </div>
        </Modal>
      )}

      {editOpen && editForm && (
        <Modal
          title="Edit dues entry"
          busy={entryBusy}
          onClose={() => {
            setEditOpen(false)
            setEditForm(null)
          }}
          footer={
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={entryBusy}
                onClick={() => {
                  setEditOpen(false)
                  setEditForm(null)
                }}
              >
                Cancel
              </button>
              <button type="button" className="btn" disabled={entryBusy} onClick={() => void saveEditEntry()}>
                {entryBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          }
        >
          <div className="form-grid">
            <label>
              Date
              <DateInput
                className="input"
                value={editForm.entryDate}
                onChange={(value) => setEditForm({ ...editForm, entryDate: value })}
              />
            </label>
            <label>
              Type
              <select
                className="select"
                value={editForm.kind}
                disabled={Boolean(
                  (() => {
                    const entry = columns.flatMap((column) => column.entries).find((item) => item.id === editForm.id)
                    return entry?.invoiceId || entry?.pledgeId
                  })(),
                )}
                onChange={(event) => setEditForm({ ...editForm, kind: event.target.value as DueEntryKind })}
              >
                <option value="due">Due (customer owes)</option>
                <option value="payment">Payment (received)</option>
              </select>
            </label>
            <label>
              Amount
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={editForm.amount || ''}
                onChange={(event) => setEditForm({ ...editForm, amount: Number(event.target.value) || 0 })}
              />
            </label>
            <label className="full">
              Note
              <input
                className="input"
                value={editForm.note}
                onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
              />
            </label>
          </div>
        </Modal>
      )}

      {open && (
        <Modal
          title="Add dues entry"
          busy={entryBusy}
          onClose={() => setOpen(false)}
          footer={
            <div className="modal-actions">
              <button type="button" className="btn secondary" disabled={entryBusy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn" disabled={entryBusy} onClick={() => void saveEntry()}>
                {entryBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          }
        >
          <div className="form-grid">
            <label className="full">
              Customer
              <select
                className="select"
                value={form.customerId || ''}
                onChange={(event) => setForm({ ...form, customerId: Number(event.target.value) })}
              >
                <option value="" disabled>
                  Select customer
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.phone ? ` — ${customer.phone}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <DateInput className="input" value={form.entryDate} onChange={(value) => setForm({ ...form, entryDate: value })} />
            </label>
            <label>
              Type
              <select
                className="select"
                value={form.kind}
                onChange={(event) => setForm({ ...form, kind: event.target.value as DueEntryKind })}
              >
                <option value="due">Due (customer owes)</option>
                <option value="payment">Payment (received)</option>
              </select>
            </label>
            <label>
              Amount
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={form.amount || ''}
                onChange={(event) => setForm({ ...form, amount: Number(event.target.value) || 0 })}
              />
            </label>
            <label className="full">
              Note
              <input
                className="input"
                placeholder="Optional"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
              />
            </label>
          </div>
        </Modal>
      )}

      {deleteEntry && (
        <ConfirmDialog
          title="Remove entry"
          message={
            deleteEntry.invoiceId
              ? `Remove this bill line (${deleteEntry.invoiceNo ?? 'from billing'})? You can add a manual line instead.`
              : 'Remove this entry?'
          }
          confirmLabel="Remove"
          busy={entryBusy}
          onCancel={() => setDeleteEntry(null)}
          onConfirm={() => void removeEntry(deleteEntry)}
        />
      )}
    </div>
  )
}
