import { useEffect, useState } from 'react'
import { goldWeightFromAmount, rateForPurity } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type { GoldSavingAccountDetail, GoldSavingPaymentMode, MetalRates } from '@shared/types'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { DateInput } from '../../../components/DateInput'
import { Modal } from '../../../components/Modal'
import { useToast } from '../../../components/toastContext'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../../lib/format'
import { api } from '../../../lib/api'
import { useAuth } from '../../auth/authContext'
import { GsGoldWeightPreview } from '../GsGoldWeightPreview'
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
  const [rates, setRates] = useState<MetalRates | null>(null)
  const [paymentDate, setPaymentDate] = useState(localTodayIso())
  const [amount, setAmount] = useState(0)
  const [lateFee, setLateFee] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [mode, setMode] = useState<GoldSavingPaymentMode>('cash')
  const [transactionRef, setTransactionRef] = useState('')
  const [remarks, setRemarks] = useState('')
  const [manualRate, setManualRate] = useState('')
  const [rateReason, setRateReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void Promise.all([api.getGsAccount(accountId), api.getLatestMetalRates()])
      .then(([next, latest]) => {
        setDetail(next)
        setRates(latest)
        setAmount(next.account.monthlyAmount)
      })
      .catch(() => undefined)
  }, [accountId])

  if (!detail) return null
  const nextInstallment = detail.installments.find((item) => item.status !== 'paid' && item.status !== 'waived')
  const configuredRate = rates ? rateForPurity(rates, detail.account.purity) : 0
  const rate = manualRate ? Number(manualRate) : configuredRate
  const weight = amount > 0 && rate > 0 ? goldWeightFromAmount(amount, rate) : 0
  const total = amount + lateFee - discount

  async function collect() {
    if (!nextInstallment) return
    try {
      setSaving(true)
      const payment = await api.collectGsPayment({
        accountId,
        installmentId: nextInstallment.id,
        paymentDate,
        amount,
        lateFee,
        discount: isAdmin ? discount : 0,
        paymentMode: mode,
        transactionRef,
        goldRate: manualRate ? Number(manualRate) : undefined,
        goldRateOverrideReason: rateReason,
        remarks,
        idempotencyKey: `${accountId}-${nextInstallment.id}-${paymentDate}-${amount}`,
      })
      showToast('Payment recorded', 'success')
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
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn" disabled={!nextInstallment || saving} onClick={() => setConfirm(true)}>
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
            <input className="input" value={nextInstallment ? `#${nextInstallment.installmentNo}` : 'None'} disabled />
          </label>
          <label>
            <span className="field-label">Payment date</span>
            <DateInput className="input" value={paymentDate} onChange={setPaymentDate} showIcon />
          </label>
          <label>
            <span className="field-label">Amount</span>
            <input className="input" type="number" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          <label>
            <span className="field-label">Late fee</span>
            <input className="input" type="number" value={lateFee || ''} onChange={(e) => setLateFee(Number(e.target.value))} />
          </label>
          {isAdmin ? (
            <label>
              <span className="field-label">Discount</span>
              <input className="input" type="number" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value))} />
            </label>
          ) : null}
          <label>
            <span className="field-label">Total received</span>
            <input className="input" value={formatCurrency(total)} disabled />
          </label>
          <label>
            <span className="field-label">Gold rate / g</span>
            <input className="input" value={configuredRate || ''} disabled />
          </label>
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
          <div className="full">
            <GsGoldWeightPreview amount={amount} rate={rate} />
            <p className="muted">This installment {formatWeight(weight, 3)} · total so far {formatWeight(detail.account.goldAccumulated, 3)}</p>
          </div>
        </div>
      </Modal>
      {confirm ? (
        <ConfirmDialog
          title="Confirm collection"
          message={`Receive ${formatCurrency(total)} and credit ${formatWeight(weight, 3)} at ${formatCurrency(rate)} / g?`}
          confirmLabel={saving ? 'Saving…' : 'Confirm'}
          danger={false}
          onConfirm={() => void collect()}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
    </>
  )
}
