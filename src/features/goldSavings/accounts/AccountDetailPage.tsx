import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, IndianRupee, Printer, RotateCcw } from 'lucide-react'
import { rateForPurity } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type { GoldSavingAccountDetail, GoldSavingPaymentMode, MetalRates } from '@shared/types'
import { DataTable } from '../../../components/DataTable'
import { DateInput } from '../../../components/DateInput'
import { FilterBar } from '../../../components/FilterBar'
import { LoadingState } from '../../../components/LoadingState'
import { Modal } from '../../../components/Modal'
import { PageHeader } from '../../../components/PageHeader'
import { StatCard } from '../../../components/StatCard'
import { useToast } from '../../../components/toastContext'
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatWeight } from '../../../lib/format'
import { api } from '../../../lib/api'
import { PrintPreviewModal } from '../../print/PrintPreviewModal'
import { CollectPaymentModal } from '../collections/CollectPaymentModal'
import { GsStatusBadge } from '../GsStatusBadge'
import { formatGsPaymentMode, GS_PAYMENT_MODES } from '../gsLabels'
import {
  bonusConditionText,
  currentBonusGold,
  isoDaysBetween,
  progressPct,
  projectedBonusGold,
  projectedGoldAtRate,
} from '../gsProjection'
import { useAuth } from '../../auth/authContext'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'installments', label: 'Installments' },
  { value: 'payments', label: 'Payments' },
  { value: 'ledger', label: 'Gold ledger' },
  { value: 'maturity', label: 'Maturity' },
  { value: 'audit', label: 'Audit' },
] as const

type DetailTab = (typeof TABS)[number]['value']

export function AccountDetailPage() {
  const { id } = useParams()
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const [detail, setDetail] = useState<GoldSavingAccountDetail | null>(null)
  const [rates, setRates] = useState<MetalRates | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [collectOpen, setCollectOpen] = useState(false)
  const [printPassbook, setPrintPassbook] = useState(false)
  const [reasonAction, setReasonAction] = useState<
    { kind: 'cancel' } | { kind: 'reverse'; paymentId: number } | { kind: 'waive'; installmentId: number } | null
  >(null)
  const [reason, setReason] = useState('')
  const [refundDate, setRefundDate] = useState(localTodayIso())
  const [cancelMode, setCancelMode] = useState<GoldSavingPaymentMode>('cash')
  const [cancelRef, setCancelRef] = useState('')
  const [deductionOverride, setDeductionOverride] = useState('')
  const [printRefundId, setPrintRefundId] = useState<number | null>(null)
  const [reasonBusy, setReasonBusy] = useState(false)

  async function reload() {
    const accountId = Number(id)
    if (!Number.isInteger(accountId)) throw new Error('Invalid account')
    setDetail(await api.getGsAccount(accountId))
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const accountId = Number(id)
        if (!Number.isInteger(accountId) || accountId <= 0) throw new Error('Invalid account')
        const [next, latest] = await Promise.all([
          api.getGsAccount(accountId),
          api.getLatestMetalRates().catch(() => null),
        ])
        if (active) {
          setDetail(next)
          setRates(latest)
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load account')
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  if (error) {
    return (
      <div className="app-page">
        <div className="error-banner">{error}</div>
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="app-page">
        <LoadingState />
      </div>
    )
  }

  const { account, scheme } = detail
  const canReversePayment =
    account.status !== 'redeemed' &&
    account.status !== 'cancelled' &&
    account.status !== 'closed' &&
    detail.redemptions.length === 0
  const schemeValue = account.monthlyAmount * account.durationMonths
  const remainingInstallments = Math.max(0, account.durationMonths - account.paidInstallments)
  const remainingAmount = Math.max(0, schemeValue - account.totalPaid)
  const today = localTodayIso()
  const daysToMaturity = isoDaysBetween(today, account.maturityDate)
  const goldRate = rates ? rateForPurity(rates, account.purity) : 0
  const projectedGold = projectedGoldAtRate({
    accumulatedGrams: account.goldAccumulated,
    remainingInstallments,
    monthlyAmount: account.monthlyAmount,
    ratePerGram: goldRate,
  })
  const bonusNow = currentBonusGold({
    scheme,
    accumulatedGrams: account.goldAccumulated,
    paidInstallments: account.paidInstallments,
    durationMonths: account.durationMonths,
    ratePerGram: goldRate,
  })
  const bonusProjected = projectedBonusGold({
    scheme,
    accumulatedGrams: account.goldAccumulated,
    remainingInstallments,
    monthlyAmount: account.monthlyAmount,
    durationMonths: account.durationMonths,
    ratePerGram: goldRate,
  })
  const installmentPct = progressPct(account.paidInstallments, account.durationMonths)
  const amountPct = progressPct(account.totalPaid, schemeValue)

  const overrideValue = deductionOverride.trim()
  const previewDeduction = (() => {
    if (overrideValue !== '' && Number.isFinite(Number(overrideValue))) {
      return Math.min(Math.max(Number(overrideValue), 0), account.totalPaid)
    }
    if (scheme.cancelDeductionType === 'percentage') {
      return Math.round(((account.totalPaid * scheme.cancelDeductionValue) / 100) * 100) / 100
    }
    if (scheme.cancelDeductionType === 'fixed') {
      return Math.min(scheme.cancelDeductionValue, account.totalPaid)
    }
    return 0
  })()
  const previewRefund = Math.round((account.totalPaid - previewDeduction) * 100) / 100

  async function cancel() {
    try {
      setReasonBusy(true)
      const override = deductionOverride.trim()
      const detail = await api.cancelGsAccount(account.id, {
        reason,
        refundDate,
        paymentMode: cancelMode,
        transactionRef: cancelRef,
        deductionOverride: override === '' ? undefined : Number(override),
      })
      showToast('Account cancelled and refund recorded', 'success')
      setReasonAction(null)
      setReason('')
      setDeductionOverride('')
      setCancelRef('')
      setDetail(detail)
      if (detail.refund) setPrintRefundId(detail.refund.id)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cancel failed', 'error')
    } finally {
      setReasonBusy(false)
    }
  }

  async function reverse(paymentId: number) {
    try {
      setReasonBusy(true)
      await api.reverseGsPayment(paymentId, reason)
      showToast('Payment reversed', 'success')
      setReasonAction(null)
      setReason('')
      await reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reverse failed', 'error')
    } finally {
      setReasonBusy(false)
    }
  }

  async function waive(installmentId: number) {
    try {
      setReasonBusy(true)
      const detail = await api.waiveGsInstallment(installmentId, reason)
      showToast('Installment waived', 'success')
      setReasonAction(null)
      setReason('')
      setDetail(detail)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Waive failed', 'error')
    } finally {
      setReasonBusy(false)
    }
  }

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title={account.accountNo}
        subtitle={`${account.customerName} · ${account.schemeName}`}
        actions={
          <>
            <Link className="btn ghost" to="/gold-savings/accounts">
              <ArrowLeft size={16} strokeWidth={2} aria-hidden />
              Accounts
            </Link>
            <button type="button" className="btn secondary" onClick={() => setPrintPassbook(true)}>
              <Printer size={16} strokeWidth={1.75} aria-hidden />
              Print passbook
            </button>
            {account.status === 'active' ? (
              <button type="button" className="btn" onClick={() => setCollectOpen(true)}>
                <IndianRupee size={16} strokeWidth={1.75} aria-hidden />
                Collect payment
              </button>
            ) : null}
            {isAdmin && (account.status === 'active' || account.status === 'matured') ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setReason('')
                  setRefundDate(localTodayIso())
                  setCancelMode('cash')
                  setCancelRef('')
                  setDeductionOverride('')
                  setReasonAction({ kind: 'cancel' })
                }}
              >
                <Ban size={16} strokeWidth={1.75} aria-hidden />
                Cancel
              </button>
            ) : null}
          </>
        }
      />
      <div className="stat-card-grid">
        <StatCard label="Total scheme value" value={formatCurrency(account.monthlyAmount * account.durationMonths)} />
        <StatCard label="Amount collected" value={formatCurrency(account.totalPaid)} tone="success" />
        <StatCard label="Gold accumulated" value={formatWeight(account.goldAccumulated, 3)} />
        <StatCard label="Installments paid" value={`${account.paidInstallments} / ${account.durationMonths}`} />
      </div>

      <FilterBar value={tab} onChange={setTab} options={[...TABS]} />

      {tab === 'overview' ? (
        <>
          <section className="card padded gs-progress-card">
            <h2 className="settings-section-title">Scheme progress</h2>
            <SchemeProgressBar
              label={`Installments ${account.paidInstallments} / ${account.durationMonths}`}
              pct={installmentPct}
            />
            <SchemeProgressBar
              label={`Amount ${formatCurrency(account.totalPaid)} / ${formatCurrency(schemeValue)}`}
              pct={amountPct}
            />
          </section>
          <div className="dashboard-lifecycle-grid">
            <section className="card padded">
              <h2 className="settings-section-title">Account snapshot</h2>
              <p className="settings-row">
                <strong>Remaining installments</strong> {remainingInstallments}
              </p>
              <p className="settings-row">
                <strong>Remaining amount</strong> {formatCurrency(remainingAmount)}
              </p>
              <p className="settings-row">
                <strong>Projected gold at maturity</strong>{' '}
                {goldRate > 0 ? formatWeight(projectedGold, 3) : 'Set today\'s gold rate'}
              </p>
              <p className="settings-row">
                <strong>Days to maturity</strong>{' '}
                {daysToMaturity < 0
                  ? `Matured ${Math.abs(daysToMaturity)} day${Math.abs(daysToMaturity) === 1 ? '' : 's'} ago`
                  : daysToMaturity === 0
                    ? 'Matures today'
                    : `${daysToMaturity} day${daysToMaturity === 1 ? '' : 's'}`}
              </p>
            </section>
            <section className="card padded">
              <h2 className="settings-section-title">Bonus projection</h2>
              <p className="settings-row">
                <strong>Current bonus</strong>{' '}
                {scheme.bonusType === 'none' || scheme.bonusValue <= 0
                  ? 'None'
                  : bonusNow > 0
                    ? formatWeight(bonusNow, 3)
                    : 'Not yet eligible'}
              </p>
              <p className="settings-row">
                <strong>If completed</strong>{' '}
                {scheme.bonusType === 'none' || scheme.bonusValue <= 0
                  ? '—'
                  : bonusProjected > 0
                    ? formatWeight(bonusProjected, 3)
                    : scheme.bonusType === 'fixed_amount'
                      ? `${formatCurrency(scheme.bonusValue)} after all installments (needs a gold rate)`
                      : '—'}
              </p>
              <p className="muted">{bonusConditionText(scheme, account.paidInstallments, account.durationMonths)}</p>
            </section>
          </div>
          <section className="card padded">
            <h2 className="settings-section-title">Account details</h2>
          <p className="settings-row"><strong>Customer</strong> {account.customerName}</p>
          <p className="settings-row"><strong>Mobile</strong> {account.customerPhone || '—'}</p>
          <p className="settings-row"><strong>Enrollment</strong> {formatDisplayDate(account.enrollmentDate)}</p>
          <p className="settings-row"><strong>Maturity</strong> {formatDisplayDate(account.maturityDate)}</p>
          <p className="settings-row"><strong>Monthly installment</strong> {formatCurrency(account.monthlyAmount)}</p>
          <p className="settings-row"><strong>Gold purity</strong> {account.purity}</p>
          <p className="settings-row"><strong>Next due</strong> {account.nextDueDate ? formatDisplayDate(account.nextDueDate) : '—'}</p>
          <p className="settings-row"><strong>Nominee</strong> {account.nomineeName || '—'}</p>
          <p className="settings-row"><strong>Status</strong> <GsStatusBadge status={account.status} /></p>
          {scheme.bonusType !== 'none' ? (
            <p className="muted">
              Configured bonus: {scheme.bonusType} {scheme.bonusValue}
              {scheme.bonusEligibility ? ` · ${scheme.bonusEligibility}` : ''}
            </p>
          ) : (
            <p className="muted">No bonus is configured on this scheme.</p>
          )}
        </section>
        {account.status === 'cancelled' && detail.refund ? (
          <section className="card padded">
            <h2 className="settings-section-title">Cancellation refund</h2>
            <p className="settings-row"><strong>Voucher</strong> {detail.refund.voucherNo}</p>
            <p className="settings-row"><strong>Refund date</strong> {formatDisplayDate(detail.refund.refundDate)}</p>
            <p className="settings-row"><strong>Total paid</strong> {formatCurrency(detail.refund.totalPaid)}</p>
            <p className="settings-row"><strong>Deduction</strong> {formatCurrency(detail.refund.deduction)}</p>
            <p className="settings-row"><strong>Refund amount</strong> {formatCurrency(detail.refund.refundAmount)}</p>
            <p className="settings-row"><strong>Gold forfeited</strong> {formatWeight(detail.refund.goldForfeited, 3)}</p>
            <p className="settings-row"><strong>Mode</strong> {formatGsPaymentMode(detail.refund.paymentMode)}</p>
            <p className="settings-row"><strong>Reference</strong> {detail.refund.transactionRef || '—'}</p>
            <p className="settings-row"><strong>Reason</strong> {detail.refund.reason}</p>
            <button type="button" className="btn secondary" onClick={() => setPrintRefundId(detail.refund!.id)}>
              <Printer size={16} strokeWidth={1.75} aria-hidden />
              Print refund voucher
            </button>
          </section>
        ) : null}
        </>
      ) : null}

      {tab === 'installments' ? (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Due date</th>
                <th className="num">Amount</th>
                <th>Status</th>
                {isAdmin ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {detail.installments.map((item) => (
                <tr key={item.id}>
                  <td>{String(item.installmentNo).padStart(2, '0')}</td>
                  <td>{formatDisplayDate(item.dueDate)}</td>
                  <td className="num">{formatCurrency(item.amount)}</td>
                  <td><GsStatusBadge status={item.status} /></td>
                  {isAdmin ? (
                    <td>
                      {item.status !== 'paid' && item.status !== 'waived' ? (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            setReason('')
                            setReasonAction({ kind: 'waive', installmentId: item.id })
                          }}
                        >
                          Waive
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      ) : null}

      {tab === 'payments' ? (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Date</th>
                <th>Inst.</th>
                <th className="num">Amount</th>
                <th className="num">Rate</th>
                <th className="num">Gold</th>
                <th>Mode</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {detail.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.receiptNo}</td>
                  <td>{formatDisplayDate(payment.paymentDate)}</td>
                  <td>{payment.installmentNo}</td>
                  <td className="num">{formatCurrency(payment.amount)}</td>
                  <td className="num">{formatCurrency(payment.goldRate)}</td>
                  <td className="num">{formatWeight(payment.goldWeight, 3)}</td>
                  <td>{formatGsPaymentMode(payment.paymentMode)}</td>
                  <td><GsStatusBadge status={payment.status} /></td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn ghost" onClick={() => setPrintPassbook(true)}>
                        <Printer size={16} />
                        Reprint
                      </button>
                      {isAdmin && payment.status === 'posted' && canReversePayment ? (
                        <button
                          type="button"
                          className="btn link-danger"
                          onClick={() => {
                            setReason('')
                            setReasonAction({ kind: 'reverse', paymentId: payment.id })
                          }}
                        >
                          <RotateCcw size={16} />
                          Reverse
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      ) : null}

      {tab === 'ledger' ? (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Ref</th>
                <th className="num">Gold</th>
                <th className="num">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {detail.ledger.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDisplayDate(entry.entryDate)}</td>
                  <td>{entry.entryType}</td>
                  <td>{entry.txnRef}</td>
                  <td className="num">{formatWeight(entry.goldWeight, 3)}</td>
                  <td className="num">{formatWeight(entry.cumulativeGold, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      ) : null}

      {tab === 'maturity' ? (
        <section className="card padded">
          <p className="muted">
            Maturity {formatDisplayDate(account.maturityDate)}. Accumulated gold {formatWeight(account.goldAccumulated, 3)}.
            Bonus is applied only from scheme configuration at redemption.
          </p>
          {account.status === 'active' || account.status === 'matured' ? (
            <Link className="btn" to={`/gold-savings/maturity?accountId=${account.id}`}>
              Open maturity
            </Link>
          ) : null}
          {detail.redemptions.length > 0 ? (
            <DataTable>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Receipt</th>
                    <th>Kind</th>
                    <th className="num">Gold</th>
                    <th className="num">Bonus</th>
                    <th className="num">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.redemptions.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDisplayDate(item.redemptionDate)}</td>
                      <td>{item.receiptNo}</td>
                      <td>{item.redemptionKind}</td>
                      <td className="num">{formatWeight(item.goldWeight, 3)}</td>
                      <td className="num">{formatWeight(item.bonusGoldWeight, 3)}</td>
                      <td className="num">{formatWeight(item.remainingGold, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          ) : null}
        </section>
      ) : null}

      {tab === 'audit' ? (
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {detail.audit.map((item) => (
                <tr key={item.id}>
                  <td>{formatDisplayDateTime(item.createdAt)}</td>
                  <td>{item.action}</td>
                  <td>
                    {item.entityType} #{item.entityId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      ) : null}

      {collectOpen ? (
        <CollectPaymentModal
          accountId={account.id}
          onClose={() => setCollectOpen(false)}
          onCollected={() => {
            setCollectOpen(false)
            setPrintPassbook(true)
            void reload()
          }}
        />
      ) : null}
      {printPassbook ? (
        <PrintPreviewModal
          title="Scheme passbook"
          path={`/print/gs-passbook/${account.id}`}
          pdfFilename="gs-passbook.pdf"
          onClose={() => setPrintPassbook(false)}
        />
      ) : null}
      {printRefundId ? (
        <PrintPreviewModal
          title="Cancellation refund voucher"
          path={`/print/gs-refund/${printRefundId}`}
          pdfFilename="gs-refund.pdf"
          onClose={() => setPrintRefundId(null)}
        />
      ) : null}
      {reasonAction ? (
        <Modal
          title={
            reasonAction.kind === 'cancel'
              ? 'Cancel scheme account'
              : reasonAction.kind === 'waive'
                ? 'Waive installment'
                : 'Reverse payment'
          }
          onClose={() => setReasonAction(null)}
          busy={reasonBusy}
          footer={
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={reasonBusy}
                onClick={() => setReasonAction(null)}
              >
                Close
              </button>
              <button
                type="button"
                className={reasonAction.kind === 'cancel' ? 'btn danger' : 'btn'}
                disabled={reasonBusy}
                onClick={() => {
                  if (!reason.trim()) {
                    showToast('Reason is required', 'error')
                    return
                  }
                  if (reasonAction.kind === 'cancel') void cancel()
                  else if (reasonAction.kind === 'waive') void waive(reasonAction.installmentId)
                  else void reverse(reasonAction.paymentId)
                }}
              >
                {reasonBusy
                  ? 'Working…'
                  : reasonAction.kind === 'cancel'
                    ? 'Cancel account & refund'
                    : reasonAction.kind === 'waive'
                      ? 'Waive installment'
                      : 'Reverse payment'}
              </button>
            </div>
          }
        >
          <p className="confirm-dialog-copy">
            {reasonAction.kind === 'cancel'
              ? 'This cancels the scheme and records a refund voucher. The payment history is kept.'
              : reasonAction.kind === 'waive'
                ? 'Waiving marks the installment as settled without a payment. Accumulated gold is unchanged, and the bonus still needs every installment paid.'
                : 'Reversing restores the installment and deducts the credited gold from the ledger. Physical stock is unchanged.'}
          </p>
          {reasonAction.kind === 'cancel' ? (
            <div className="gs-cancel-summary">
              <p className="settings-row">
                <strong>Total paid</strong> {formatCurrency(account.totalPaid)}
              </p>
              <p className="settings-row">
                <strong>Deduction</strong> {formatCurrency(previewDeduction)}
              </p>
              <p className="settings-row">
                <strong>Refund amount</strong> {formatCurrency(previewRefund)}
              </p>
              <p className="settings-row">
                <strong>Gold forfeited</strong> {formatWeight(account.goldAccumulated, 3)}
              </p>
            </div>
          ) : null}
          <label>
            <span className="field-label">Reason</span>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
          {reasonAction.kind === 'cancel' ? (
            <>
              <label>
                <span className="field-label">Refund date</span>
                <DateInput className="input" value={refundDate} onChange={setRefundDate} showIcon />
              </label>
              <label>
                <span className="field-label">Payment mode</span>
                <select
                  className="input"
                  value={cancelMode}
                  onChange={(e) => setCancelMode(e.target.value as GoldSavingPaymentMode)}
                >
                  {GS_PAYMENT_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {formatGsPaymentMode(mode)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Transaction reference</span>
                <input className="input" value={cancelRef} onChange={(e) => setCancelRef(e.target.value)} />
              </label>
              <label>
                <span className="field-label">Deduction override (₹, optional)</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={deductionOverride}
                  onChange={(e) => setDeductionOverride(e.target.value)}
                  placeholder={`Scheme default: ${formatCurrency(previewDeduction)}`}
                />
              </label>
            </>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}

function SchemeProgressBar({ label, pct }: { label: string; pct: number }) {
  const width = Math.min(100, Math.max(0, pct))
  return (
    <div className="gs-scheme-progress">
      <div className="gs-scheme-progress-meta">
        <span>{label}</span>
        <strong className="num">{pct}%</strong>
      </div>
      <div className="gs-progress-track">
        <div className="gs-progress-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
