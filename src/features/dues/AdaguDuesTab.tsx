import { useMemo, useRef, useState, useEffect } from 'react'
import { localTodayIso } from '@shared/localDate'
import type {
  AdaguDueSummary,
  DuesLedger,
  PledgeAuctionInput,
  PledgePaymentMode,
  PledgeReminderEntry,
} from '@shared/types'
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
import { AdaguRemindersTab } from './AdaguRemindersTab'
import { AuctionModal } from './AuctionModal'
import { InterestCollectionModal } from './InterestCollectionModal'
import { PLEDGE_PAYMENT_MODES } from './pledgePaymentModes'
import { RenewModal } from './RenewModal'
import { TopupModal } from './TopupModal'
import { PledgePreviewModal } from '../pledges/PledgePreviewModal'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'

type AdaguFilter = 'all' | 'overdue' | 'due' | 'paid' | 'notice' | 'auctioned' | 'reminders'

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
  const [redeemAction, setRedeemAction] = useState<'partial' | 'full' | null>(null)
  const [viewTarget, setViewTarget] = useState<AdaguDueSummary | null>(null)
  const [billTarget, setBillTarget] = useState<number | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<number | null>(null)
  const [interestTarget, setInterestTarget] = useState<AdaguDueSummary | null>(null)
  const [topupTarget, setTopupTarget] = useState<AdaguDueSummary | null>(null)
  const [renewTarget, setRenewTarget] = useState<AdaguDueSummary | null>(null)
  const [renewedTarget, setRenewedTarget] = useState<number | null>(null)
  const [redeemTarget, setRedeemTarget] = useState<AdaguDueSummary | null>(null)
  const [auctionTarget, setAuctionTarget] = useState<AdaguDueSummary | null>(null)
  const [auctionMode, setAuctionMode] = useState<'notice' | 'auction'>('notice')
  const [noticePrintTarget, setNoticePrintTarget] = useState<number | null>(null)
  const [redeemDate, setRedeemDate] = useState(localTodayIso())
  const [redeemAmount, setRedeemAmount] = useState(0)
  const [redeemDiscount, setRedeemDiscount] = useState(0)
  const [redeemMode, setRedeemMode] = useState<PledgePaymentMode>('cash')
  const [reminders, setReminders] = useState<PledgeReminderEntry[]>([])
  const [remindersLoading, setRemindersLoading] = useState(false)
  const remindersLoadedRef = useRef(false)

  async function loadReminders(background = false) {
    try {
      if (!background) setRemindersLoading(true)
      onError(null)
      setReminders(await api.listPledgeReminders())
      remindersLoadedRef.current = true
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load reminders')
    } finally {
      setRemindersLoading(false)
    }
  }

  useEffect(() => {
    // On first open show the skeleton; later visits refresh quietly so the list
    // does not blank out while it reloads.
    if (filter === 'reminders') void loadReminders(remindersLoadedRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  async function sendWhatsApp(row: PledgeReminderEntry) {
    if (!row.whatsappUrl) {
      onError('Add a mobile number to this customer to send a reminder')
      return
    }
    try {
      setBusy(true)
      onError(null)
      await api.openWhatsAppReminder({
        pledgeId: row.pledgeId,
        url: row.whatsappUrl,
        kind: row.reason,
      })
      showToast('WhatsApp reminder opened', 'success')
      await loadReminders(true)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to open WhatsApp')
    } finally {
      setBusy(false)
    }
  }

  function remindInterest(row: PledgeReminderEntry) {
    const summary = (ledger.adaguDues ?? []).find((entry) => entry.pledgeId === row.pledgeId)
    if (!summary) {
      onError('Open the loan to collect interest')
      return
    }
    setInterestTarget(summary)
  }

  const rows = useMemo(() => {
    const list = ledger.adaguDues ?? []
    return list.filter((row) => {
      if (filter === 'overdue') return row.isInterestOverdue
      if (filter === 'due') return row.status === 'active' && row.remaining > 0
      if (filter === 'paid') return row.status === 'redeemed' || row.remaining <= 0
      if (filter === 'notice') return Boolean(row.auctionNoticeDate) && !row.auctionDate
      if (filter === 'auctioned') return Boolean(row.auctionDate)
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
    setRedeemDiscount(0)
    setRedeemMode('cash')
  }

  async function collectInterest(input: {
    amount: number
    collectedDate: string
    mode: PledgePaymentMode
  }) {
    if (!interestTarget) return
    try {
      setBusy(true)
      onError(null)
      const updated = await api.collectPledge({
        id: interestTarget.pledgeId,
        collectedDate: input.collectedDate,
        amount: input.amount,
        mode: input.mode,
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

  async function renewLoan(input: {
    renewDate: string
    mode: PledgePaymentMode
    newLoanAmount: number
    note: string
  }) {
    if (!renewTarget) return
    try {
      setBusy(true)
      onError(null)
      const created = await api.renewPledge({
        id: renewTarget.pledgeId,
        renewDate: input.renewDate,
        mode: input.mode,
        newLoanAmount: input.newLoanAmount,
        note: input.note,
      })
      setRenewTarget(null)
      setViewTarget(null)
      showToast(`Loan renewed as ${created.receiptNo}`, 'success')
      await reloadAndSyncView()
      setRenewedTarget(created.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to renew loan')
    } finally {
      setBusy(false)
    }
  }

  async function collectPartial() {
    if (!redeemTarget || redeemAmount <= 0) return
    try {
      setRedeemAction('partial')
      setBusy(true)
      onError(null)
      const updated = await api.collectPledge({
        id: redeemTarget.pledgeId,
        collectedDate: redeemDate,
        amount: redeemAmount,
        mode: redeemMode,
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
      setRedeemAction(null)
    }
  }

  async function redeemFull() {
    if (!redeemTarget) return
    try {
      setRedeemAction('full')
      setBusy(true)
      onError(null)
      const updated = await api.redeemPledge({
        id: redeemTarget.pledgeId,
        redeemedDate: redeemDate,
        amountCollected: redeemAmount || redeemTarget.remaining - redeemDiscount,
        discount: redeemDiscount,
        mode: redeemMode,
      })
      setRedeemTarget(null)
      showToast('Adagu loan closed', 'success')
      await reloadAndSyncView()
      setReleaseTarget(updated.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to close loan')
    } finally {
      setBusy(false)
      setRedeemAction(null)
    }
  }

  async function sendAuctionNotice(input: { noticeDate: string }) {
    if (!auctionTarget) return
    try {
      setBusy(true)
      onError(null)
      await api.sendPledgeAuctionNotice({
        id: auctionTarget.pledgeId,
        noticeDate: input.noticeDate,
      })
      setAuctionTarget(null)
      showToast('Auction notice saved', 'success')
      await reloadAndSyncView()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save auction notice')
    } finally {
      setBusy(false)
    }
  }

  async function recordAuction(input: Omit<PledgeAuctionInput, 'id'>) {
    if (!auctionTarget) return
    try {
      setBusy(true)
      onError(null)
      const updated = await api.recordPledgeAuction({
        id: auctionTarget.pledgeId,
        ...input,
      })
      setAuctionTarget(null)
      showToast(`Auction recorded for ${updated.receiptNo}`, 'success')
      await reloadAndSyncView()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to record auction')
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
          { value: 'notice', label: 'Notice sent' },
          { value: 'auctioned', label: 'Auctioned' },
          { value: 'reminders', label: 'Reminders' },
          { value: 'paid', label: 'Closed' },
        ]}
      />

      {filter === 'reminders' ? (
        <AdaguRemindersTab
          rows={reminders}
          loading={remindersLoading}
          busy={busy}
          onWhatsApp={(row) => void sendWhatsApp(row)}
          onCollectInterest={remindInterest}
        />
      ) : loading && !error ? (
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
          onRenew={() => setRenewTarget(viewTarget)}
          onAuctionNotice={() => {
            setAuctionMode('notice')
            setAuctionTarget(viewTarget)
          }}
          onRecordAuction={() => {
            setAuctionMode('auction')
            setAuctionTarget(viewTarget)
          }}
          onPrintNotice={() => setNoticePrintTarget(viewTarget.pledgeId)}
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

      {renewTarget ? (
        <RenewModal
          summary={renewTarget}
          busy={busy}
          onClose={() => setRenewTarget(null)}
          onSubmit={(input) => void renewLoan(input)}
        />
      ) : null}

      {renewedTarget != null ? (
        <PrintPreviewModal
          title="Renewal ticket"
          path={printPreviewPaths.pledge(renewedTarget)}
          pdfFilename="adagu-renewal.pdf"
          onClose={() => setRenewedTarget(null)}
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
                {redeemAction === 'partial' ? 'Recording…' : 'Record collection'}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void redeemFull()}>
                {redeemAction === 'full' ? 'Closing…' : 'Full redeem'}
              </button>
            </div>
          }
        >
          <dl className="dues-detail-totals">
            <div>
              <dt>Principal outstanding</dt>
              <dd className="num">{formatCurrency(redeemTarget.principalOutstanding)}</dd>
            </div>
            <div>
              <dt>Interest due</dt>
              <dd className="num">{formatCurrency(redeemTarget.interestDue)}</dd>
            </div>
            <div>
              <dt>Interest paid up to</dt>
              <dd>{formatDisplayDate(redeemTarget.interestPaidUpto)}</dd>
            </div>
            <div>
              <dt>Payoff</dt>
              <dd className="num">
                <strong>{formatCurrency(redeemTarget.remaining)}</strong>
              </dd>
            </div>
          </dl>
          <div className="form-grid">
            <label>
              Date
              <DateInput className="input" value={redeemDate} onChange={(value) => setRedeemDate(value || localTodayIso())} />
            </label>
            <label>
              Amount collected
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={redeemAmount || ''}
                onChange={(event) => setRedeemAmount(Number(event.target.value) || 0)}
              />
            </label>
            <label>
              Discount
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={redeemDiscount || ''}
                onChange={(event) => {
                  const discount = Math.max(0, Number(event.target.value) || 0)
                  setRedeemDiscount(discount)
                  setRedeemAmount(Math.max(0, redeemTarget.remaining - discount))
                }}
              />
            </label>
            <label>
              Mode
              <select
                className="input"
                value={redeemMode}
                onChange={(event) => setRedeemMode(event.target.value as PledgePaymentMode)}
              >
                {PLEDGE_PAYMENT_MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted">
            Collect {formatCurrency(redeemAmount)} and write off {formatCurrency(redeemDiscount)} to close. Discount
            applies to full redeem only.
          </p>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: '0.5rem' }}
            onClick={() => {
              setRedeemDiscount(0)
              setRedeemAmount(redeemTarget.remaining)
            }}
          >
            Fill payoff
          </button>
        </Modal>
      ) : null}

      {auctionTarget ? (
        <AuctionModal
          summary={auctionTarget}
          mode={auctionMode}
          busy={busy}
          onClose={() => setAuctionTarget(null)}
          onNotice={(input) => void sendAuctionNotice(input)}
          onAuction={(input) => void recordAuction(input)}
        />
      ) : null}

      {noticePrintTarget != null ? (
        <PrintPreviewModal
          title="Auction notice"
          path={printPreviewPaths.pledgeNotice(noticePrintTarget)}
          pdfFilename="adagu-auction-notice.pdf"
          onClose={() => setNoticePrintTarget(null)}
        />
      ) : null}
    </div>
  )
}
