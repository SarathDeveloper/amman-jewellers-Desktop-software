import { useEffect, useMemo, useState } from 'react'
import { Ban, CopyPlus, Eye, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
import type { Inward, InwardStatus } from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DateInput } from '../../components/DateInput'
import { DataTable, TablePager } from '../../components/DataTable'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { Modal } from '../../components/Modal'
import { PageHeader } from '../../components/PageHeader'
import { SearchBar } from '../../components/SearchBar'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDate, formatWeight, paginate, TABLE_PAGE_SIZE } from '../../lib/format'
import { InwardEditorModal } from './InwardEditorModal'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'

type StatusFilter = 'all' | InwardStatus

export function InwardsPage() {
  const { showToast } = useToast()
  const [inwards, setInwards] = useState<Inward[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [supplierFilter, setSupplierFilter] = useState<number | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<{ inward: Inward | null; readOnly: boolean } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [finalizeId, setFinalizeId] = useState<number | null>(null)
  const [cancelId, setCancelId] = useState<number | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)
  const [copyBusyId, setCopyBusyId] = useState<number | null>(null)
  const [printInwardId, setPrintInwardId] = useState<number | null>(null)

  async function load() {
    try {
      setError(null)
      setInwards(await api.listInwards())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const rows = await api.listInwards()
        if (!active) return
        setInwards(rows)
        setError(null)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load purchases')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const supplierOptions = useMemo(() => {
    const byId = new Map<number, string>()
    for (const inward of inwards) byId.set(inward.supplierId, inward.supplierName)
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [inwards])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return inwards.filter((inward) => {
      if (statusFilter !== 'all' && inward.status !== statusFilter) return false
      if (supplierFilter !== '' && inward.supplierId !== supplierFilter) return false
      if (fromDate && inward.inwardDate < fromDate) return false
      if (toDate && inward.inwardDate > toDate) return false
      if (!query) return true
      return (
        inward.inwardNo.toLowerCase().includes(query) ||
        inward.supplierInvoiceNo.toLowerCase().includes(query) ||
        inward.supplierName.toLowerCase().includes(query)
      )
    })
  }, [inwards, search, statusFilter, supplierFilter, fromDate, toDate])

  const summary = useMemo(() => {
    let total = 0
    let weight = 0
    let drafts = 0
    let finals = 0
    let cancelled = 0
    for (const inward of filtered) {
      if (inward.status === 'draft') {
        drafts += 1
        continue
      }
      if (inward.status === 'cancelled') {
        cancelled += 1
        continue
      }
      finals += 1
      total += inward.total
      for (const item of inward.items) weight += item.netWeight * item.qty
    }
    return { total, weight, drafts, finals, cancelled }
  }, [filtered])

  const hasExtraFilters = fromDate !== '' || toDate !== '' || supplierFilter !== ''

  const paged = useMemo(() => paginate(filtered, page, TABLE_PAGE_SIZE), [filtered, page])

  async function remove(id: number) {
    try {
      await api.deleteInward(id)
      setDeleteId(null)
      showToast('Draft deleted', 'success')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete draft')
    }
  }

  async function finalize(id: number) {
    try {
      await api.finalizeInward(id)
      setFinalizeId(null)
      showToast('Purchase finalized — stock updated', 'success')
      await load()
    } catch (err) {
      setFinalizeId(null)
      setError(err instanceof Error ? err.message : 'Failed to finalize purchase')
    }
  }

  async function cancelPurchase() {
    if (cancelId == null) return
    const reason = cancelReason.trim()
    if (!reason) {
      setError('Enter a reason for cancelling this purchase')
      return
    }
    try {
      setCancelBusy(true)
      await api.cancelInward(cancelId, reason)
      setCancelId(null)
      setCancelReason('')
      showToast('Purchase cancelled — stock reversed', 'success')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel purchase')
    } finally {
      setCancelBusy(false)
    }
  }

  async function copyPurchase(id: number) {
    try {
      setCopyBusyId(id)
      const draft = await api.copyInward(id)
      showToast(`Draft ${draft.inwardNo} created`, 'success')
      await load()
      setEditor({ inward: draft, readOnly: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy purchase')
    } finally {
      setCopyBusyId(null)
    }
  }

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title="Purchase"
        subtitle="Purchase stock. Finalize to update product pieces and gold & silver weight."
        actions={
          <>
            <SearchBar
              value={search}
              onChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              placeholder="Search purchase no or supplier..."
            />
            <button type="button" className="btn" onClick={() => setEditor({ inward: null, readOnly: false })}>
              <Plus size={18} aria-hidden />
              New purchase
            </button>
          </>
        }
      />

      <div className="filter-bar" role="group" aria-label="Purchase status">
        {(['all', 'draft', 'final', 'cancelled'] as const).map((status) => (
          <button
            key={status}
            type="button"
            className={`filter-chip${statusFilter === status ? ' active' : ''}`}
            aria-pressed={statusFilter === status}
            onClick={() => {
              setStatusFilter(status)
              setPage(1)
            }}
          >
            {status === 'all'
              ? 'All'
              : status === 'draft'
                ? 'Draft'
                : status === 'final'
                  ? 'Final'
                  : 'Cancelled'}
          </button>
        ))}
      </div>

      <div className="filter-bar reports-filters purchase-filters" role="group" aria-label="Purchase filters">
        <label>
          From
          <DateInput
            className="input"
            ariaLabel="From date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(value) => {
              setFromDate(value)
              setPage(1)
            }}
          />
        </label>
        <label>
          To
          <DateInput
            className="input"
            ariaLabel="To date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(value) => {
              setToDate(value)
              setPage(1)
            }}
          />
        </label>
        <label>
          Supplier
          <select
            className="select"
            value={supplierFilter}
            onChange={(event) => {
              setSupplierFilter(event.target.value ? Number(event.target.value) : '')
              setPage(1)
            }}
          >
            <option value="">All suppliers</option>
            {supplierOptions.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        {hasExtraFilters ? (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setFromDate('')
              setToDate('')
              setSupplierFilter('')
              setPage(1)
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {!loading && filtered.length > 0 ? (
        <p className="muted">
          {summary.finals} final · {formatCurrency(summary.total)} · {formatWeight(summary.weight)}
          {summary.drafts > 0 ? ` · ${summary.drafts} draft${summary.drafts === 1 ? '' : 's'} not in stock yet` : ''}
          {summary.cancelled > 0
            ? ` · ${summary.cancelled} cancelled (excluded from totals)`
            : ''}
        </p>
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={inwards.length === 0 ? 'No purchases yet' : 'No matching purchases'}
          description="Create a draft, then finalize it to add stock."
        />
      ) : (
        <DataTable footer={<TablePager page={page} total={filtered.length} onPageChange={setPage} />}>
          <table>
            <thead>
              <tr>
                <th>Purchase no</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((inward) => (
                <tr key={inward.id}>
                  <td>{inward.inwardNo}</td>
                  <td>{formatDisplayDate(inward.inwardDate)}</td>
                  <td>
                    {inward.supplierName}
                    {inward.source === 'stock_add' ? <span className="badge stock-add">Stock add</span> : null}
                  </td>
                  <td>
                    <span className={`badge ${inward.status}`}>
                      {inward.status === 'draft'
                        ? 'Draft'
                        : inward.status === 'final'
                          ? 'Final'
                          : 'Cancelled'}
                    </span>
                  </td>
                  <td className="num">{formatCurrency(inward.total)}</td>
                  <td>
                    <div className="row-actions">
                      {inward.status === 'draft' ? (
                        <>
                          <button
                            type="button"
                            className="btn ghost icon-btn"
                            aria-label={`Edit ${inward.inwardNo}`}
                            onClick={() => setEditor({ inward, readOnly: false })}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => setFinalizeId(inward.id)}
                          >
                            Finalize
                          </button>
                          <button
                            type="button"
                            className="btn ghost icon-btn"
                            aria-label={`Print ${inward.inwardNo}`}
                            onClick={() => setPrintInwardId(inward.id)}
                          >
                            <Printer size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn ghost icon-btn"
                            aria-label={`Delete ${inward.inwardNo}`}
                            onClick={() => setDeleteId(inward.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn ghost icon-btn"
                            aria-label={`View ${inward.inwardNo}`}
                            onClick={() => setEditor({ inward, readOnly: true })}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn ghost icon-btn"
                            aria-label={`Print ${inward.inwardNo}`}
                            onClick={() => setPrintInwardId(inward.id)}
                          >
                            <Printer size={15} />
                          </button>
                          {inward.status === 'final' && inward.source === 'purchase' ? (
                            <button
                              type="button"
                              className="btn ghost row-action-danger"
                              onClick={() => {
                                setCancelReason('')
                                setCancelId(inward.id)
                              }}
                            >
                              <Ban size={15} aria-hidden />
                              Cancel
                            </button>
                          ) : null}
                          {inward.status === 'cancelled' ? (
                            <button
                              type="button"
                              className="btn ghost"
                              disabled={copyBusyId === inward.id}
                              onClick={() => void copyPurchase(inward.id)}
                            >
                              <CopyPlus size={15} aria-hidden />
                              {copyBusyId === inward.id ? 'Copying…' : 'Copy to draft'}
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      {editor ? (
        <InwardEditorModal
          inward={editor.inward}
          readOnly={editor.readOnly}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      ) : null}

      {deleteId != null ? (
        <ConfirmDialog
          title="Delete draft?"
          message="This purchase has not updated stock yet."
          confirmLabel="Delete"
          onCancel={() => setDeleteId(null)}
          onConfirm={() => {
            void remove(deleteId)
          }}
        />
      ) : null}

      {finalizeId != null ? (
        <ConfirmDialog
          title="Finalize purchase?"
          message="This adds piece stock and gold or silver weight. A finalized purchase cannot be edited."
          confirmLabel="Finalize"
          danger={false}
          onCancel={() => setFinalizeId(null)}
          onConfirm={() => {
            void finalize(finalizeId)
          }}
        />
      ) : null}

      {cancelId != null ? (
        <Modal
          title="Cancel purchase?"
          onClose={() => setCancelId(null)}
          footer={
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={cancelBusy}
                onClick={() => setCancelId(null)}
              >
                Keep purchase
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={cancelBusy || cancelReason.trim() === ''}
                onClick={() => void cancelPurchase()}
              >
                {cancelBusy ? 'Cancelling…' : 'Cancel purchase'}
              </button>
            </div>
          }
        >
          <p className="confirm-dialog-copy">
            This removes the pieces and weight the purchase added, and marks it cancelled. The
            original lines stay for the audit trail. It is refused if any of the pieces were already
            sold.
          </p>
          <label className="field">
            <span>Reason (required)</span>
            <textarea
              className="input"
              rows={3}
              value={cancelReason}
              placeholder="e.g. Supplier invoice entered twice"
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </label>
        </Modal>
      ) : null}

      {printInwardId != null ? (
        <PrintPreviewModal
          title="Print preview"
          path={printPreviewPaths.purchase(printInwardId)}
          pdfFilename="purchase.pdf"
          onClose={() => setPrintInwardId(null)}
        />
      ) : null}
    </div>
  )
}
