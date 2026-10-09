import { useEffect, useMemo, useState } from 'react'
import { Ban, Eye, Pencil, Plus, Printer, Trash2, Wallet } from 'lucide-react'
import type {
  OldGoldPurchase,
  OldGoldPurchaseItem,
  OldGoldPurchasePayout,
  OldGoldPurchaseStatus,
} from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable, TablePager } from '../../components/DataTable'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/PageHeader'
import { SearchBar } from '../../components/SearchBar'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatCurrency, formatDisplayDate, formatWeight, paginate, TABLE_PAGE_SIZE } from '../../lib/format'
import { printPreviewPaths } from '../print/printPreviewPaths'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { OldGoldPurchaseEditorModal } from './OldGoldPurchaseEditorModal'
import { OldGoldPayoutModal } from './OldGoldPayoutModal'
import { OldGoldReasonModal } from './OldGoldReasonModal'

type StatusFilter = 'all' | OldGoldPurchaseStatus

function itemLabel(items: OldGoldPurchaseItem[]): string {
  const first = items[0]?.description.trim() || 'Old gold'
  if (items.length <= 1) return first
  return `${first} · ${items.length} items`
}

function netWeightG(items: OldGoldPurchaseItem[]): number {
  return items.reduce((sum, item) => sum + item.netWeight, 0)
}

function uniquePurities(items: OldGoldPurchaseItem[]): string[] {
  return [...new Set(items.map((item) => item.purity.trim()).filter(Boolean))]
}

function purityLabel(items: OldGoldPurchaseItem[]): { text: string; title?: string } {
  const purities = uniquePurities(items)
  if (purities.length === 0) return { text: '—' }
  if (purities.length >= 3) return { text: 'Mixed', title: purities.join(', ') }
  return { text: purities.join('/') }
}

const MONEY_EPSILON = 0.009

function activePayouts(purchase: OldGoldPurchase): OldGoldPurchasePayout[] {
  return purchase.payouts.filter((payout) => payout.voidedAt == null)
}

function appliedLabel(purchase: OldGoldPurchase): { text: string; title?: string } {
  if (purchase.links.length === 0) return { text: '—' }
  const text = purchase.links
    .map((link) => (link.invoiceStatus === 'final' ? link.invoiceNo : 'Draft bill'))
    .join(', ')
  return { text, title: purchase.links.map((link) => `${link.invoiceNo} · ${formatCurrency(link.amount)}`).join('\n') }
}

export function OldGoldPurchasesPage() {
  const { showToast } = useToast()
  const [purchases, setPurchases] = useState<OldGoldPurchase[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<{ purchase: OldGoldPurchase | null; readOnly: boolean } | null>(
    null,
  )
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [finalizeId, setFinalizeId] = useState<number | null>(null)
  const [payoutTarget, setPayoutTarget] = useState<OldGoldPurchase | null>(null)
  const [cancelTarget, setCancelTarget] = useState<OldGoldPurchase | null>(null)
  const [voidTarget, setVoidTarget] = useState<{ purchase: OldGoldPurchase; payout: OldGoldPurchasePayout } | null>(
    null,
  )
  const [printId, setPrintId] = useState<number | null>(null)

  async function load() {
    try {
      setError(null)
      setPurchases(await api.listOldGoldPurchases())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load old gold purchases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const rows = await api.listOldGoldPurchases()
        if (!active) return
        setPurchases(rows)
        setError(null)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load old gold purchases')
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
    return purchases.filter((purchase) => {
      if (statusFilter !== 'all' && purchase.status !== statusFilter) return false
      if (!query) return true
      return (
        purchase.purchaseNo.toLowerCase().includes(query) ||
        purchase.customerName.toLowerCase().includes(query) ||
        purchase.customerPhone.toLowerCase().includes(query) ||
        purchase.items.some((item) => item.description.toLowerCase().includes(query))
      )
    })
  }, [purchases, search, statusFilter])

  const paged = useMemo(() => paginate(filtered, page, TABLE_PAGE_SIZE), [filtered, page])

  async function remove(id: number) {
    try {
      await api.deleteOldGoldPurchase(id)
      setDeleteId(null)
      showToast('Draft deleted', 'success')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete draft')
    }
  }

  async function finalize(id: number) {
    try {
      await api.finalizeOldGoldPurchase(id)
      setFinalizeId(null)
      showToast('Old gold purchase finalized', 'success')
      await load()
    } catch (err) {
      setFinalizeId(null)
      setError(err instanceof Error ? err.message : 'Failed to finalize purchase')
    }
  }

  async function cancel(purchase: OldGoldPurchase, reason: string) {
    await api.cancelOldGoldPurchase(purchase.id, reason)
    setCancelTarget(null)
    showToast(`${purchase.purchaseNo} cancelled`, 'success')
    await load()
  }

  async function voidPayout(purchase: OldGoldPurchase, payout: OldGoldPurchasePayout, reason: string) {
    await api.voidOldGoldPayout(purchase.id, payout.id, reason)
    setVoidTarget(null)
    showToast('Payout voided', 'success')
    await load()
  }

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title="Old Gold Purchase"
        subtitle="Buy old gold from customers. Apply the bill number on a sale, or pay the customer the balance."
        actions={
          <>
            <SearchBar
              value={search}
              onChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              placeholder="Search bill no or customer..."
            />
            <button
              type="button"
              className="btn"
              onClick={() => setEditor({ purchase: null, readOnly: false })}
            >
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

      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={purchases.length === 0 ? 'No old gold purchases yet' : 'No matching purchases'}
          description="Create a purchase, finalize it, then enter the bill number on a sale."
        />
      ) : (
        <DataTable footer={<TablePager page={page} total={filtered.length} onPageChange={setPage} />}>
          <table>
            <thead>
              <tr>
                <th>Bill no</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Items</th>
                <th className="num">Net wt</th>
                <th>Purity</th>
                <th>Status</th>
                <th>Applied to</th>
                <th className="num">Amount</th>
                <th className="num">Paid out</th>
                <th className="num">Balance</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((purchase) => {
                const purity = purityLabel(purchase.items)
                const applied = appliedLabel(purchase)
                return (
                  <tr key={purchase.id}>
                    <td>{purchase.purchaseNo}</td>
                    <td>{formatDisplayDate(purchase.purchaseDate)}</td>
                    <td>
                      {purchase.customerName || '—'}
                      {purchase.customerPhone ? (
                        <span className="cell-hint">{purchase.customerPhone}</span>
                      ) : null}
                    </td>
                    <td>{itemLabel(purchase.items)}</td>
                    <td className="num">{formatWeight(netWeightG(purchase.items))}</td>
                    <td title={purity.title}>{purity.text}</td>
                    <td>
                      <span className={`badge ${purchase.status}`}>
                        {purchase.status === 'draft'
                          ? 'Draft'
                          : purchase.status === 'final'
                            ? 'Final'
                            : 'Cancelled'}
                      </span>
                    </td>
                    <td title={applied.title}>{applied.text}</td>
                    <td className="num">{formatCurrency(purchase.totalAmount)}</td>
                    <td className="num">{formatCurrency(purchase.paidOut)}</td>
                    <td className="num">
                      {purchase.status === 'cancelled' ? '—' : formatCurrency(purchase.balance)}
                    </td>
                    <td>
                      <div className="row-actions">
                        {purchase.status === 'draft' ? (
                          <>
                            <button
                              type="button"
                              className="btn ghost icon-btn"
                              aria-label={`Edit ${purchase.purchaseNo}`}
                              onClick={() => setEditor({ purchase, readOnly: false })}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => setFinalizeId(purchase.id)}
                            >
                              Finalize
                            </button>
                            <button
                              type="button"
                              className="btn ghost icon-btn"
                              aria-label={`Delete ${purchase.purchaseNo}`}
                              onClick={() => setDeleteId(purchase.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            {purchase.status === 'final' && purchase.balance > MONEY_EPSILON ? (
                              <button
                                type="button"
                                className="btn ghost icon-btn"
                                aria-label={`Pay out ${purchase.purchaseNo}`}
                                onClick={() => setPayoutTarget(purchase)}
                              >
                                <Wallet size={15} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn ghost icon-btn"
                              aria-label={`Print ${purchase.purchaseNo}`}
                              onClick={() => setPrintId(purchase.id)}
                            >
                              <Printer size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn ghost icon-btn"
                              aria-label={`View ${purchase.purchaseNo}`}
                              onClick={() => setEditor({ purchase, readOnly: true })}
                            >
                              <Eye size={15} />
                            </button>
                            {purchase.status === 'final' &&
                            purchase.links.length === 0 &&
                            activePayouts(purchase).length === 0 ? (
                              <button
                                type="button"
                                className="btn ghost icon-btn"
                                aria-label={`Cancel ${purchase.purchaseNo}`}
                                onClick={() => setCancelTarget(purchase)}
                              >
                                <Ban size={15} />
                              </button>
                            ) : null}
                          </>
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

      {editor ? (
        <OldGoldPurchaseEditorModal
          purchase={editor.purchase}
          readOnly={editor.readOnly}
          onClose={() => setEditor(null)}
          onSaved={load}
          onVoidPayout={(purchase, payout) => setVoidTarget({ purchase, payout })}
        />
      ) : null}

      {payoutTarget ? (
        <OldGoldPayoutModal
          purchase={payoutTarget}
          onClose={() => setPayoutTarget(null)}
          onSaved={async () => {
            setPayoutTarget(null)
            showToast('Payout recorded', 'success')
            await load()
          }}
        />
      ) : null}

      {cancelTarget ? (
        <OldGoldReasonModal
          title={`Cancel ${cancelTarget.purchaseNo}?`}
          message="Cancelling keeps the number used but marks the purchase void. You can only cancel a purchase that is not applied to a bill and has no payout."
          label="Reason"
          placeholder="Why is this purchase being cancelled?"
          confirmLabel="Cancel purchase"
          danger
          busyLabel="Cancelling…"
          onCancel={() => setCancelTarget(null)}
          onConfirm={(reason) => cancel(cancelTarget, reason)}
        />
      ) : null}

      {voidTarget ? (
        <OldGoldReasonModal
          title="Void payout?"
          message={`Void the ${formatCurrency(voidTarget.payout.amount)} payout on ${voidTarget.purchase.purchaseNo}? The amount returns to the purchase balance.`}
          label="Reason"
          placeholder="Why is this payout being voided?"
          confirmLabel="Void payout"
          danger
          busyLabel="Voiding…"
          onCancel={() => setVoidTarget(null)}
          onConfirm={(reason) => voidPayout(voidTarget.purchase, voidTarget.payout, reason)}
        />
      ) : null}

      {printId != null ? (
        <PrintPreviewModal
          title="Print preview"
          path={printPreviewPaths.oldGoldPurchase(printId)}
          pdfFilename="old-gold-purchase.pdf"
          onClose={() => setPrintId(null)}
        />
      ) : null}

      {deleteId != null ? (
        <ConfirmDialog
          title="Delete draft?"
          message="This purchase has not been applied to a sale bill."
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
          message="This records the old gold purchase so it can be applied on a sale bill or paid out. It does not add stock to Purchase."
          confirmLabel="Finalize"
          danger={false}
          onCancel={() => setFinalizeId(null)}
          onConfirm={() => {
            void finalize(finalizeId)
          }}
        />
      ) : null}
    </div>
  )
}
