import { useEffect, useMemo, useState } from 'react'
import { Eye, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
import type { Inward, InwardStatus } from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable, TablePager } from '../../components/DataTable'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/PageHeader'
import { SearchBar } from '../../components/SearchBar'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDate, paginate, TABLE_PAGE_SIZE } from '../../lib/format'
import { InwardEditorModal } from './InwardEditorModal'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'

type StatusFilter = 'all' | InwardStatus

export function InwardsPage() {
  const { showToast } = useToast()
  const [inwards, setInwards] = useState<Inward[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<{ inward: Inward | null; readOnly: boolean } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [finalizeId, setFinalizeId] = useState<number | null>(null)
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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return inwards.filter((inward) => {
      if (statusFilter !== 'all' && inward.status !== statusFilter) return false
      if (!query) return true
      return (
        inward.inwardNo.toLowerCase().includes(query) ||
        inward.supplierName.toLowerCase().includes(query)
      )
    })
  }, [inwards, search, statusFilter])

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
        {(['all', 'draft', 'final'] as const).map((status) => (
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
            {status === 'all' ? 'All' : status === 'draft' ? 'Draft' : 'Final'}
          </button>
        ))}
      </div>

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
                  <td>{inward.supplierName}</td>
                  <td>
                    <span className={`badge ${inward.status}`}>{inward.status === 'draft' ? 'Draft' : 'Final'}</span>
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

      {printInwardId != null ? (
        <PrintPreviewModal
          title="Print preview"
          path={printPreviewPaths.purchase(printInwardId)}
          onClose={() => setPrintInwardId(null)}
        />
      ) : null}
    </div>
  )
}
