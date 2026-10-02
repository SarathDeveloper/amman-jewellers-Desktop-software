import { useMemo, useState } from 'react'
import { localTodayIso } from '@shared/localDate'
import type { AdaguDueSummary, DuesLedger } from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DateInput } from '../../components/DateInput'
import { DataTable, TablePager } from '../../components/DataTable'
import { EmptyState } from '../../components/EmptyState'
import { FilterBar } from '../../components/FilterBar'
import { LoadingState } from '../../components/LoadingState'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/toastContext'
import { formatCurrency, formatDisplayDate, paginate, TABLE_PAGE_SIZE } from '../../lib/format'
import { api } from '../../lib/api'
import { AdaguDueDetailDrawer } from './AdaguDueDetailDrawer'
import { InterestCollectionModal } from './InterestCollectionModal'
import { TopupModal } from './TopupModal'
import { PledgePreviewModal } from '../pledges/PledgePreviewModal'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'

type AdaguFilter = 'all' | 'overdue' | 'due' | 'paid'

export function AdaguDuesTab({
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
  const [filter, setFilter] = useState<AdaguFilter>('all')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [viewTarget, setViewTarget] = useState<AdaguDueSummary | null>(null)
  const [billTarget, setBillTarget] = useState<number | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<number | null>(null)
  const [interestTarget, setInterestTarget] = useState<AdaguDueSummary | null>(null)
  const [topupTarget, setTopupTarget] = useState<AdaguDueSummary | null>(null)
  const [redeemTarget, setRedeemTarget] = useState<AdaguDueSummary | null>(null)
  const [closeTarget, setCloseTarget] = useState<AdaguDueSummary | null>(null)
  const [redeemDate, setRedeemDate] = useState(localTodayIso())
  const [redeemAmount, setRedeemAmount] = useState(0)

  const rows = useMemo(() => {
    const list = ledger.adaguDues ?? []
    return list.filter((row) => {
      if (filter === 'overdue') return row.isInterestOverdue
      if (filter === 'due') return row.status === 'active' && row.remaining > 0
      if (filter === 'paid') return row.status === 'redeemed' || row.remaining <= 0
      return true
    })
  }, [ledger.adaguDues, filter])

  const paged = useMemo(() => paginate(rows, page, TABLE_PAGE_SIZE), [rows, page])

  async function reloadAndSyncView() {
    const data = await onReload()
    setViewTarget((current) => {
      if (!current) return null
      return (data.adaguDues ?? []).find((row) => row.pledgeId === current.pledgeId) ?? null
    })
    return data
  }

  function openDetail(row: AdaguDueSummary) {
    setViewTarget(row)
  }

  function openRedeem(summary: AdaguDueSummary) {
    setRedeemTarget(summary)
    setRedeemDate(localTodayIso())
    setRedeemAmount(summary.remaining)
  }

  async function collectInterest(input: { amount: number; collectedDate: string }) {
    if (!interestTarget) return
    try {
      setBusy(true)
      onError(null)
      const updated = await api.collectPledge({
        id: interestTarget.pledgeId,
        collectedDate: input.collectedDate,
        amount: input.amount,
      })
      setInterestTarget(null)
      showToast(
        updated.status === 'redeemed' ? 'Loan closed and gold ready to release' : 'Interest collected',
        'success',
      )
      await reloadAndSyncView()
      if (updated.status === 'redeemed') setReleaseTarget(updated.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to collect interest')
    } finally {
      setBusy(false)
    }
  }

  async function addTopup(input: { amount: number; topupDate: string; note: string }) {
    if (!topupTarget) return
    try {
      setBusy(true)
      onError(null)
      await api.addPledgeTopup({
        pledgeId: topupTarget.pledgeId,
        topupDate: input.topupDate,
        amount: input.amount,
        note: input.note,
      })
      setTopupTarget(null)
      showToast('Extra loan added', 'success')
      await reloadAndSyncView()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to add extra loan')
    } finally {
      setBusy(false)
    }
  }

  async function collectPartial() {
    if (!redeemTarget || redeemAmount <= 0) return
    try {
      setBusy(true)
      onError(null)
      const updated = await api.collectPledge({
        id: redeemTarget.pledgeId,
        collectedDate: redeemDate,
        amount: redeemAmount,
      })
      setRedeemTarget(null)
      showToast(
        updated.status === 'redeemed' ? 'Loan closed and gold ready to release' : 'Collection recorded',
        'success',
      )
      await reloadAndSyncView()
      if (updated.status === 'redeemed') setReleaseTarget(updated.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to collect')
    } finally {
      setBusy(false)
    }
  }

  async function redeemFull() {
    if (!redeemTarget) return
    try {
      setBusy(true)
      onError(null)
      const updated = await api.redeemPledge({
        id: redeemTarget.pledgeId,
        redeemedDate: redeemDate,
        amountCollected: redeemAmount || redeemTarget.remaining,
      })
      setRedeemTarget(null)
      showToast('Adagu loan closed', 'success')
      await reloadAndSyncView()
      setReleaseTarget(updated.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to close loan')
    } finally {
      setBusy(false)
    }
  }

  async function forfeitPledge() {
    if (!closeTarget) return
    try {
      setBusy(true)
      onError(null)
      await api.forfeitPledge({
        id: closeTarget.pledgeId,
        forfeitedDate: localTodayIso(),
      })
      setCloseTarget(null)
      showToast('Pledge forfeited / closed', 'success')
      await reloadAndSyncView()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to forfeit pledge')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dues-tab-panel-inner">
      <FilterBar
        value={filter}
        onChange={(value) => {
          setFilter(value)
          setPage(1)
        }}
        options={[
          { value: 'all', label: 'All' },
          { value: 'overdue', label: 'Interest due' },
          { value: 'due', label: 'Active' },
          { value: 'paid', label: 'Closed' },
        ]}
      />

      {loading && !error ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState title="No Adagu dues" description="Active loans and interest collections will appear here." />
      ) : (
        <DataTable footer={<TablePager page={page} total={rows.length} onPageChange={setPage} />}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Customer</th>
                <th>Receipt No</th>
                <th className="num">Principal</th>
                <th className="num">Monthly Interest</th>
                <th>Next Due</th>
                <th className="num">Days</th>
                <th className="num">Total Due</th>
                <th className="num">Remaining</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((row, index) => (
                <tr
                  key={row.pledgeId}
                  className={`dues-adagu-row${row.isInterestOverdue ? ' dues-adagu-overdue' : ''}`}
                  tabIndex={0}
                  onClick={() => openDetail(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openDetail(row)
                    }
                  }}
                >
                  <td>{String((page - 1) * TABLE_PAGE_SIZE + index + 1).padStart(2, '0')}</td>
                  <td>
                    <div>{row.customerName}</div>
                    <span className="muted">{row.customerPhone || '—'}</span>
                    {row.isInterestOverdue ? (
                      <span className="dues-overdue-badge">Interest overdue</span>
                    ) : null}
                  </td>
                  <td className="dues-adagu-receipt">{row.receiptNo}</td>
                  <td className="num">{formatCurrency(row.principal)}</td>
                  <td className="num">{formatCurrency(row.monthlyInterest)}</td>
                  <td>{formatDisplayDate(row.nextInterestDue)}</td>
                  <td className="num">{row.daysActive}</td>
                  <td className="num">{formatCurrency(row.totalDue)}</td>
                  <td className={`num ${row.remaining > 0 ? 'due-amount' : 'paid-amount'}`}>
                    {formatCurrency(row.remaining)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          openDetail(row)
                        }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          setBillTarget(row.pledgeId)
                        }}
                      >
                        Bill
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      {viewTarget ? (
        <AdaguDueDetailDrawer
          summary={viewTarget}
          payments={
            ledger.columns
              .find((column) => column.customerId === viewTarget.customerId)
              ?.entries.filter(
                (entry) => entry.pledgeId === viewTarget.pledgeId && entry.kind === 'payment',
              ) ?? []
          }
          busy={busy}
          onClose={() => setViewTarget(null)}
          onCollectInterest={() => setInterestTarget(viewTarget)}
          onTopup={() => setTopupTarget(viewTarget)}
          onRedeem={() => openRedeem(viewTarget)}
          onForfeit={() => setCloseTarget(viewTarget)}
          onViewBill={() => setBillTarget(viewTarget.pledgeId)}
          onReleaseReceipt={() => setReleaseTarget(viewTarget.pledgeId)}
        />
      ) : null}

      {billTarget ? (
        <PledgePreviewModal pledgeId={billTarget} onClose={() => setBillTarget(null)} />
      ) : null}

      {releaseTarget != null ? (
        <PrintPreviewModal
          title="Print preview"
          path={printPreviewPaths.pledgeRelease(releaseTarget)}
          pdfFilename="pledge-release.pdf"
          onClose={() => setReleaseTarget(null)}
        />
      ) : null}

      {interestTarget ? (
        <InterestCollectionModal
          summary={interestTarget}
          busy={busy}
          onClose={() => setInterestTarget(null)}
          onSubmit={(input) => void collectInterest(input)}
        />
      ) : null}

      {topupTarget ? (
        <TopupModal
          summary={topupTarget}
          busy={busy}
          onClose={() => setTopupTarget(null)}
          onSubmit={(input) => void addTopup(input)}
        />
      ) : null}

      {redeemTarget ? (
        <Modal
          title={`Close Adagu loan · ${redeemTarget.receiptNo}`}
          onClose={() => setRedeemTarget(null)}
          footer={
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setRedeemTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn secondary" disabled={busy} onClick={() => void collectPartial()}>
                Record collection
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void redeemFull()}>
                Full redeem
              </button>
            </div>
          }
        >
          <p className="muted">
            Remaining due is <strong>{formatCurrency(redeemTarget.remaining)}</strong>. Full redeem prints a gold
            release receipt.
          </p>
          <div className="form-grid">
            <label>
              Date
              <DateInput className="input" value={redeemDate} onChange={(value) => setRedeemDate(value || localTodayIso())} />
            </label>
            <label>
              Amount
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={redeemAmount || ''}
                onChange={(event) => setRedeemAmount(Number(event.target.value) || 0)}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: '0.5rem' }}
            onClick={() => setRedeemAmount(redeemTarget.remaining)}
          >
            Fill remaining due
          </button>
        </Modal>
      ) : null}

      {closeTarget ? (
        <ConfirmDialog
          title="Close / forfeit pledge"
          message={`Mark ${closeTarget.receiptNo} as forfeited? It cannot be edited afterward.`}
          confirmLabel="Forfeit"
          danger
          onCancel={() => setCloseTarget(null)}
          onConfirm={() => void forfeitPledge()}
        />
      ) : null}
    </div>
  )
}
