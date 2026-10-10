import { useEffect, useState } from 'react'
import { computeLateFee, goldWeightFromAmount } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type { GoldSavingAccountDetail, GoldSavingPaymentMode, GoldSavingRate } from '@shared/types'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { DataTable } from '../../../components/DataTable'
import { DateInput } from '../../../components/DateInput'
import { LoadingState } from '../../../components/LoadingState'
import { Modal } from '../../../components/Modal'
import { useToast } from '../../../components/toastContext'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../../lib/format'
import { api } from '../../../lib/api'
import { useAuth } from '../../auth/authContext'
import { GsGoldWeightPreview } from '../GsGoldWeightPreview'
import { GsRateNotice } from '../GsRateNotice'
import { GS_PAYMENT_MODES } from '../gsLabels'

export function CollectPaymentModal({
  accountId,
  onClose,
  onCollected,
}: {
  accountId: number
  onClose: () => void
  onCollected: (paymentId: number) => void
}) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const [detail, setDetail] = useState<GoldSavingAccountDetail | null>(null)
  const [rateInfo, setRateInfo] = useState<GoldSavingRate | null>(null)
  const [acceptRateDate, setAcceptRateDate] = useState(false)
  const [paymentDate, setPaymentDate] = useState(localTodayIso())
  const [amount, setAmount] = useState(0)
  const [count, setCount] = useState(1)
  const [lateFeeOverride, setLateFeeOverride] = useState<number | null>(null)
  const [discount, setDiscount] = useState(0)
  const [mode, setMode] = useState<GoldSavingPaymentMode>('cash')
  const [transactionRef, setTransactionRef] = useState('')
  const [remarks, setRemarks] = useState('')
  const [manualRate, setManualRate] = useState('')
  const [rateReason, setRateReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `gs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )

  useEffect(() => {
    void api
      .getGsAccount(accountId)
      .then((next) => {
        setDetail(next)
        setAmount(next.account.monthlyAmount)
        const overdue = next.installments.filter((item) => item.status === 'overdue').length
        setCount(Math.max(1, overdue))
      })
      .catch(() => undefined)
  }, [accountId])

  const unpaid = detail
    ? detail.installments.filter((item) => item.status !== 'paid' && item.status !== 'waived')
    : []
  const nextInstallment = unpaid[0]
  const maxCount = Math.max(1, unpaid.length)
  const requestedCount = Math.min(Math.max(1, count), maxCount)
  const suggestedLateFee =
    detail && nextInstallment
      ? computeLateFee({
          dueDate: nextInstallment.dueDate,
          paymentDate,
          graceDays: detail.scheme.gracePeriodDays,
          type: detail.scheme.lateFeeType,
          value: detail.scheme.lateFeeValue,
        })
      : 0
  const lateFee = lateFeeOverride ?? suggestedLateFee

  if (!detail) {
    return (
      <Modal className="modal-wide" title="Collect payment" onClose={onClose}>
        <LoadingState rows={4} />
      </Modal>
    )
  }
  const configuredRate = rateInfo?.rate ?? 0
  const rate = manualRate ? Number(manualRate) : configuredRate
  const staleRate = Boolean(rateInfo && !rateInfo.matchesDate)
  const rateBlocked = staleRate && (!isAdmin || !acceptRateDate)

  const previewRows = unpaid.slice(0, requestedCount).map((item) => ({
    installment: item,
    lateFee: computeLateFee({
      dueDate: item.dueDate,
      paymentDate,
      graceDays: detail.scheme.gracePeriodDays,
      type: detail.scheme.lateFeeType,
      value: detail.scheme.lateFeeValue,
    }),
    gold: amount > 0 && rate > 0 ? goldWeightFromAmount(amount, rate) : 0,
  }))
  const single = requestedCount === 1
  const batchLateFee = single ? lateFee : previewRows.reduce((sum, row) => sum + row.lateFee, 0)
  const total = amount * requestedCount + batchLateFee - discount
  const weight = previewRows.reduce((sum, row) => sum + row.gold, 0)

  async function collect() {
    if (!nextInstallment) return
    try {
      setSaving(true)
      const payment = await api.collectGsPayment({
        accountId,
        installmentId: nextInstallment.id,
        installmentCount: requestedCount,
        paymentDate,
        amount,
        lateFee: single ? lateFee : undefined,
        discount: isAdmin ? discount : 0,
        paymentMode: mode,
        transactionRef,
        goldRate: manualRate ? Number(manualRate) : undefined,
        goldRateOverrideReason: rateReason,
        acceptRateDate: acceptRateDate || undefined,
        remarks,
        idempotencyKey,
      })
      showToast(
        requestedCount > 1 ? `${requestedCount} installments recorded` : 'Payment recorded',
        'success',
      )
      onCollected(payment.id)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Collection failed', 'error')
    } finally {
      setSaving(false)
      setConfirm(false)
    }
  }

  return (
    <>
      <Modal
        className="modal-wide"
        title={`Collect ${detail.account.accountNo}`}
        onClose={onClose}
        footer={
          <div className="modal-actions">
            <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn"
              disabled={!nextInstallment || saving || rateBlocked}
              onClick={() => setConfirm(true)}
            >
              Record payment
            </button>
          </div>
        }
      >
        <p className="muted">
          {detail.account.customerName} · next due {nextInstallment ? formatDisplayDate(nextInstallment.dueDate) : '—'} ·
          accumulated {formatWeight(detail.account.goldAccumulated, 3)}
        </p>
        <div className="form-grid">
          <label>
            <span className="field-label">Installment</span>
            <input
              className="input"
              value={
                nextInstallment
                  ? single
                    ? `#${nextInstallment.installmentNo}`
                    : `#${nextInstallment.installmentNo} + ${requestedCount - 1} more`
                  : 'None'
              }
              disabled
            />
          </label>
          <label>
            <span className="field-label">Installments to collect</span>
            <div className="gs-stepper">
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => setCount(Math.max(1, requestedCount - 1))}
                disabled={requestedCount <= 1}
                aria-label="Fewer installments"
              >
                −
              </button>
              <input
                className="input num"
                type="number"
                min={1}
                max={maxCount}
                value={requestedCount}
                onChange={(e) => setCount(Number(e.target.value))}
              />
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => setCount(Math.min(maxCount, requestedCount + 1))}
                disabled={requestedCount >= maxCount}
                aria-label="More installments"
              >
                +
              </button>
            </div>
          </label>
          <label>
            <span className="field-label">Payment date</span>
            <DateInput
              className="input"
              value={paymentDate}
              onChange={(value) => {
                setPaymentDate(value)
                setLateFeeOverride(null)
                setAcceptRateDate(false)
              }}
              showIcon
            />
          </label>
          <label>
            <span className="field-label">{single ? 'Amount' : 'Amount per installment'}</span>
            <input className="input" type="number" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          <label>
            <span className="field-label">Late fee</span>
            <input
              className="input"
              type="number"
              value={(single ? lateFee : batchLateFee) || ''}
              disabled={!isAdmin || !single}
              onChange={(e) => setLateFeeOverride(Number(e.target.value))}
            />
            <span className="muted">
              {!single
                ? 'Each installment is charged its own fee, shown below'
                : detail.scheme.lateFeeType === 'per_day'
                  ? `${detail.scheme.lateFeeValue} / day after ${detail.scheme.gracePeriodDays} grace days`
                  : detail.scheme.lateFeeType === 'fixed'
                    ? `Flat fee after ${detail.scheme.gracePeriodDays} grace days`
                    : 'No late fee is configured for this scheme'}
            </span>
          </label>
          {isAdmin ? (
            <label>
              <span className="field-label">Discount{!single ? ' (first installment)' : ''}</span>
              <input className="input" type="number" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value))} />
            </label>
          ) : null}
          <label>
            <span className="field-label">Total received</span>
            <input className="input" value={formatCurrency(total)} disabled />
          </label>
          <div className="full">
            <GsRateNotice
              date={paymentDate}
              purity={detail.account.purity}
              isAdmin={isAdmin}
              acceptRateDate={acceptRateDate}
              onAcceptRateDateChange={setAcceptRateDate}
              onRate={setRateInfo}
            />
          </div>
          {detail.scheme.goldRateSource === 'manual_allowed' && isAdmin ? (
            <>
              <label>
                <span className="field-label">Manual rate</span>
                <input className="input" value={manualRate} onChange={(e) => setManualRate(e.target.value)} />
              </label>
              <label>
                <span className="field-label">Override reason</span>
                <input className="input" value={rateReason} onChange={(e) => setRateReason(e.target.value)} />
              </label>
            </>
          ) : null}
          <label>
            <span className="field-label">Payment mode</span>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as GoldSavingPaymentMode)}>
              {GS_PAYMENT_MODES.map((item) => (
                <option key={item} value={item}>{item.replace('_', ' ')}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Transaction reference</span>
            <input className="input" value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} />
          </label>
          <label className="full">
            <span className="field-label">Remarks</span>
            <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
          {!single ? (
            <div className="full">
              <span className="field-label">Installments in this receipt</span>
              <DataTable>
                <table>
                  <thead>
                    <tr>
                      <th>Inst.</th>
                      <th>Due</th>
                      <th className="num">Amount</th>
                      <th className="num">Late fee</th>
                      <th className="num">Gold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.installment.id}>
                        <td>#{row.installment.installmentNo}</td>
                        <td>{formatDisplayDate(row.installment.dueDate)}</td>
                        <td className="num">{formatCurrency(amount)}</td>
                        <td className="num">{formatCurrency(row.lateFee)}</td>
                        <td className="num">{formatWeight(row.gold, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
              <p className="muted">
                {requestedCount} installments · {formatCurrency(amount * requestedCount)} in installments +{' '}
                {formatCurrency(batchLateFee)} late fee = {formatCurrency(total)} · total{' '}
                {formatWeight(weight, 3)}
              </p>
            </div>
          ) : null}
          <div className="full">
            <GsGoldWeightPreview amount={amount * requestedCount} rate={rate} />
            <p className="muted">
              {single ? 'This installment' : `This receipt (${requestedCount} installments)`}{' '}
              {formatWeight(weight, 3)} · total so far {formatWeight(detail.account.goldAccumulated, 3)}
            </p>
          </div>
        </div>
      </Modal>
      {confirm ? (
        <ConfirmDialog
          title="Confirm collection"
          message={
            single
              ? `Receive ${formatCurrency(total)} and credit ${formatWeight(weight, 3)} at ${formatCurrency(rate)} / g?`
              : `Receive ${formatCurrency(total)} for ${requestedCount} installments and credit ${formatWeight(weight, 3)} at ${formatCurrency(rate)} / g?`
          }
          confirmLabel="Confirm"
          danger={false}
          busy={saving}
          onConfirm={() => void collect()}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
    </>
  )
}
