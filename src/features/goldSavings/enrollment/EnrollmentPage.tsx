import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addCalendarMonths, goldWeightFromAmount, rateForPurity } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type { Customer, GoldSavingPaymentMode, GoldSavingScheme, MetalRates } from '@shared/types'
import { DateInput } from '../../../components/DateInput'
import { PageHeader } from '../../../components/PageHeader'
import { useToast } from '../../../components/toastContext'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../../lib/format'
import { api } from '../../../lib/api'
import { BillCustomerSearch } from '../../invoices/BillCustomerSearch'
import { PrintPreviewModal } from '../../print/PrintPreviewModal'
import { GsGoldWeightPreview } from '../GsGoldWeightPreview'
import { GS_PAYMENT_MODES } from '../gsLabels'

export function EnrollmentPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [schemes, setSchemes] = useState<GoldSavingScheme[]>([])
  const [rates, setRates] = useState<MetalRates | null>(null)
  const [customerId, setCustomerId] = useState(0)
  const [schemeId, setSchemeId] = useState(0)
  const [monthlyAmount, setMonthlyAmount] = useState(0)
  const [enrollmentDate, setEnrollmentDate] = useState(localTodayIso())
  const [firstInstallmentDate, setFirstInstallmentDate] = useState(localTodayIso())
  const [preferredPaymentDay, setPreferredPaymentDay] = useState('')
  const [nomineeName, setNomineeName] = useState('')
  const [nomineeRelationship, setNomineeRelationship] = useState('')
  const [nomineePhone, setNomineePhone] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [collectInitial, setCollectInitial] = useState(true)
  const [paymentMode, setPaymentMode] = useState<GoldSavingPaymentMode>('cash')
  const [transactionRef, setTransactionRef] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [printPaymentId, setPrintPaymentId] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([api.listCustomers(), api.listGsSchemes(), api.getLatestMetalRates()]).then(
      ([customerList, schemeList, latest]) => {
        if (!active) return
        setCustomers(customerList)
        const activeSchemes = schemeList.filter((scheme) => scheme.status === 'active')
        setSchemes(activeSchemes)
        setRates(latest)
        setSchemeId((current) => current || activeSchemes[0]?.id || 0)
        setMonthlyAmount((current) => current || activeSchemes[0]?.monthlyAmount || 0)
      },
    )
    return () => {
      active = false
    }
  }, [])

  const scheme = schemes.find((item) => item.id === schemeId) ?? null
  const customer = customers.find((item) => item.id === customerId) ?? null
  const maturityDate = scheme ? addCalendarMonths(firstInstallmentDate, scheme.durationMonths - 1) : ''
  const goldRate = scheme && rates ? rateForPurity(rates, scheme.purity) : 0
  const initialWeight = monthlyAmount > 0 && goldRate > 0 ? goldWeightFromAmount(monthlyAmount, goldRate) : 0

  async function enroll() {
    if (!scheme || !customer) return
    try {
      setSaving(true)
      const detail = await api.createGsAccount({
        customerId: customer.id,
        schemeId: scheme.id,
        monthlyAmount,
        enrollmentDate,
        firstInstallmentDate,
        preferredPaymentDay: preferredPaymentDay ? Number(preferredPaymentDay) : null,
        nomineeName,
        nomineeRelationship,
        nomineePhone,
        termsAccepted,
        initialPayment: collectInitial
          ? {
              amount: monthlyAmount,
              paymentDate: enrollmentDate,
              paymentMode,
              transactionRef,
            }
          : undefined,
      })
      showToast('Customer enrolled', 'success')
      const firstPayment = detail.payments[0]
      if (firstPayment) setPrintPaymentId(firstPayment.id)
      else navigate(`/gold-savings/accounts/${detail.account.id}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Enrollment failed', 'error')
    } finally {
      setSaving(false)
      setConfirmOpen(false)
    }
  }

  const ready = Boolean(customer && scheme && termsAccepted && monthlyAmount > 0)
  const summary =
    customer && scheme
      ? `Enroll ${customer.name} in ${scheme.name} at ${formatCurrency(monthlyAmount)} / month?`
      : ''

  return (
    <div className="app-page">
      <PageHeader
        title="Enroll customer"
        subtitle="Creates the scheme account, installment schedule and optional first receipt"
      />
      <div className="settings-shop-workspace">
        <div className="settings-stack">
          <section className="card padded">
            <h2 className="settings-section-title">Customer information</h2>
            <BillCustomerSearch
              customers={customers}
              customerId={customerId}
              onSelect={(next) => {
                setCustomerId(next.id)
                setCustomers((current) => (current.some((item) => item.id === next.id) ? current : [next, ...current]))
              }}
              onClear={() => setCustomerId(0)}
              onCustomerCreated={(next) => {
                setCustomers((current) => [next, ...current])
                setCustomerId(next.id)
              }}
            />
            {customer ? (
              <>
                <p className="settings-row"><strong>Customer ID</strong> {customer.id}</p>
                <p className="settings-row"><strong>Mobile</strong> {customer.phone}</p>
                <p className="settings-row"><strong>Address</strong> {customer.address || '—'}</p>
              </>
            ) : null}
            <div className="form-grid">
              <label>
                <span className="field-label">Nominee name</span>
                <input className="input" value={nomineeName} onChange={(e) => setNomineeName(e.target.value)} />
              </label>
              <label>
                <span className="field-label">Nominee relationship</span>
                <input className="input" value={nomineeRelationship} onChange={(e) => setNomineeRelationship(e.target.value)} />
              </label>
              <label>
                <span className="field-label">Nominee mobile</span>
                <input className="input" value={nomineePhone} maxLength={10} onChange={(e) => setNomineePhone(e.target.value.replace(/\D/g, ''))} />
              </label>
            </div>
          </section>

          <section className="card padded">
            <h2 className="settings-section-title">Scheme information</h2>
            <div className="form-grid">
              <label>
                <span className="field-label">Scheme</span>
                <select
                  className="input"
                  value={schemeId}
                  onChange={(e) => {
                    const nextId = Number(e.target.value)
                    setSchemeId(nextId)
                    const next = schemes.find((item) => item.id === nextId)
                    if (next) setMonthlyAmount(next.monthlyAmount)
                  }}
                >
                  <option value={0}>Select scheme</option>
                  {schemes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Monthly installment</span>
                <input className="input" type="number" value={monthlyAmount || ''} onChange={(e) => setMonthlyAmount(Number(e.target.value))} />
              </label>
              <label>
                <span className="field-label">Enrollment date</span>
                <DateInput value={enrollmentDate} onChange={setEnrollmentDate} />
              </label>
              <label>
                <span className="field-label">First installment date</span>
                <DateInput value={firstInstallmentDate} onChange={setFirstInstallmentDate} />
              </label>
              <label>
                <span className="field-label">Expected maturity</span>
                <input className="input" value={maturityDate ? formatDisplayDate(maturityDate) : ''} disabled />
              </label>
              <label>
                <span className="field-label">Preferred payment day</span>
                <input className="input" type="number" min={1} max={28} value={preferredPaymentDay} onChange={(e) => setPreferredPaymentDay(e.target.value)} />
              </label>
              <label>
                <span className="field-label">Gold purity</span>
                <input className="input" value={scheme?.purity ?? ''} disabled />
              </label>
              <label>
                <span className="field-label">Duration</span>
                <input className="input" value={scheme ? `${scheme.durationMonths} months` : ''} disabled />
              </label>
            </div>
            {scheme?.terms ? <p className="gs-terms">{scheme.terms}</p> : null}
            <label className="gs-check">
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
              I confirm the customer has accepted the scheme terms
            </label>
          </section>
        </div>

        <aside className="settings-shop-aside">
          <section className="card padded">
            <h2 className="settings-section-title">Initial payment</h2>
            <label className="gs-check">
              <input type="checkbox" checked={collectInitial} onChange={(e) => setCollectInitial(e.target.checked)} />
              Collect first installment now
            </label>
            {collectInitial ? (
              <div className="form-grid gs-stack-fields">
                <label>
                  <span className="field-label">Amount</span>
                  <input className="input" type="number" value={monthlyAmount || ''} onChange={(e) => setMonthlyAmount(Number(e.target.value))} />
                </label>
                <label>
                  <span className="field-label">Gold rate / g</span>
                  <input className="input" value={goldRate || ''} disabled />
                </label>
                <label>
                  <span className="field-label">Payment mode</span>
                  <select className="input" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as GoldSavingPaymentMode)}>
                    {GS_PAYMENT_MODES.map((mode) => (
                      <option key={mode} value={mode}>{mode.replace('_', ' ')}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Transaction reference</span>
                  <input className="input" value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} />
                </label>
                <GsGoldWeightPreview amount={monthlyAmount} rate={goldRate} />
                <p className="muted">This installment: {formatWeight(initialWeight, 3)}</p>
              </div>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn" disabled={!ready || saving} onClick={() => setConfirmOpen(true)}>
                Create scheme account
              </button>
            </div>
          </section>
        </aside>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          title="Confirm enrollment"
          message={summary}
          confirmLabel="Enroll"
          danger={false}
          onConfirm={() => void enroll()}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : null}
      {printPaymentId ? (
        <PrintPreviewModal
          title="Enrollment receipt"
          path={`/print/gs-receipt/${printPaymentId}`}
          onClose={() => {
            const id = printPaymentId
            setPrintPaymentId(null)
            void api.getGsPayment(id).then((payment) => navigate(`/gold-savings/accounts/${payment.accountId}`))
          }}
        />
      ) : null}
    </div>
  )
}
