import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { computeInvoiceTax, roundMoney } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import type { BillFormat, Customer, PaymentMode } from '@shared/types'
import { PageHeader } from '../../components/PageHeader'
import { DateInput } from '../../components/DateInput'
import { api } from '../../lib/api'
import { numericFieldToNumber, parseNumericField, type NumericField } from '../../lib/numericField'
import { BILL_PAYMENT_MODES, PaymentModeSelect } from './PaymentModeSelect'

export function OldBillPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerId, setCustomerId] = useState(0)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(localTodayIso())
  const [billFormat, setBillFormat] = useState<BillFormat>('cash_bill')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash')
  const [subtotal, setSubtotal] = useState<NumericField>('')
  const [discount, setDiscount] = useState<NumericField>('')
  const [autoTax, setAutoTax] = useState(true)
  const [useIgst, setUseIgst] = useState(false)
  const [tax, setTax] = useState<NumericField>('')
  const [amountPaid, setAmountPaid] = useState<NumericField>('')
  const [goldWeight, setGoldWeight] = useState<NumericField>('')
  const [silverWeight, setSilverWeight] = useState<NumericField>('')
  const [makingCharges, setMakingCharges] = useState<NumericField>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const data = await api.listCustomers()
        if (active) setCustomers(data)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load customers')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase()
    if (!query) return customers
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) || customer.phone.toLowerCase().includes(query),
    )
  }, [customers, customerSearch])

  const preview = useMemo(() => {
    const amount = roundMoney(numericFieldToNumber(subtotal))
    const discountAmount = roundMoney(Math.min(numericFieldToNumber(discount), amount))
    const taxable = roundMoney(amount - discountAmount)
    if (billFormat === 'tax_invoice' && autoTax) {
      const gst = computeInvoiceTax(taxable, useIgst)
      return { total: roundMoney(taxable + gst.tax), tax: gst.tax }
    }
    const manualTax = billFormat === 'tax_invoice' ? roundMoney(numericFieldToNumber(tax)) : 0
    return { total: roundMoney(taxable + manualTax), tax: manualTax }
  }, [subtotal, discount, billFormat, autoTax, useIgst, tax])

  async function save() {
    try {
      setBusy(true)
      setError(null)
      if (!customerId) {
        throw new Error('Select a customer')
      }
      const saved = await api.recordHistoricalInvoice({
        invoiceNo: invoiceNo.trim(),
        customerId,
        invoiceDate,
        billFormat,
        paymentMode,
        subtotal: numericFieldToNumber(subtotal),
        discount: numericFieldToNumber(discount),
        autoTax: billFormat === 'tax_invoice' && autoTax,
        useIgst,
        tax: numericFieldToNumber(tax),
        amountPaid: numericFieldToNumber(amountPaid),
        goldWeight: numericFieldToNumber(goldWeight),
        silverWeight: numericFieldToNumber(silverWeight),
        makingCharges: numericFieldToNumber(makingCharges),
      })
      navigate(
        saved.billFormat === 'tax_invoice'
          ? `/billing/tax/${saved.id}`
          : `/billing/cash/${saved.id}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save old bill')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-page">
      <PageHeader
        title="Record old bill"
        subtitle="Keeps the original bill number and date. Stock is not changed. A remaining balance is added to dues."
        actions={
          <Link to="/billing" className="btn secondary">
            <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
            Back
          </Link>
        }
      />
      {error && <div className="error-banner">{error}</div>}
      <div className="card padded">
        <div className="form-grid">
          <label>
            Original bill number
            <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="CB-1842" />
          </label>
          <label>
            Bill date
            <DateInput className="input" value={invoiceDate} onChange={setInvoiceDate} />
          </label>
          <label>
            Customer search
            <input
              className="input"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Name or phone"
            />
          </label>
          <label>
            Customer
            <select className="select" value={customerId} onChange={(e) => setCustomerId(Number(e.target.value))}>
              <option value={0}>Select customer</option>
              {filteredCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                  {customer.phone ? ` — ${customer.phone}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Format
            <select className="select" value={billFormat} onChange={(e) => setBillFormat(e.target.value as BillFormat)}>
              <option value="cash_bill">Cash bill</option>
              <option value="tax_invoice">Tax invoice</option>
            </select>
          </label>
          <PaymentModeSelect
            value={paymentMode}
            modes={BILL_PAYMENT_MODES}
            disabled={busy}
            onChange={setPaymentMode}
          />
          <label>
            Bill amount
            <input className="input" type="number" step="0.01" value={subtotal} onChange={(e) => setSubtotal(parseNumericField(e.target.value))} />
          </label>
          <label>
            Discount
            <input className="input" type="number" step="0.01" value={discount} onChange={(e) => setDiscount(parseNumericField(e.target.value))} />
          </label>
          <label>
            Amount paid
            <input className="input" type="number" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(parseNumericField(e.target.value))} />
          </label>
          <label>
            Gold grams
            <input className="input" type="number" step="0.001" value={goldWeight} onChange={(e) => setGoldWeight(parseNumericField(e.target.value))} />
          </label>
          <label>
            Silver grams
            <input className="input" type="number" step="0.001" value={silverWeight} onChange={(e) => setSilverWeight(parseNumericField(e.target.value))} />
          </label>
          <label>
            Making charges
            <input className="input" type="number" step="0.01" value={makingCharges} onChange={(e) => setMakingCharges(parseNumericField(e.target.value))} />
          </label>
          {billFormat === 'tax_invoice' && (
            <label className="billing-checkbox">
              <input type="checkbox" checked={autoTax} onChange={(e) => setAutoTax(e.target.checked)} />
              Auto GST 3%
            </label>
          )}
          {billFormat === 'tax_invoice' && (
            <label className="billing-checkbox">
              <input type="checkbox" checked={useIgst} onChange={(e) => setUseIgst(e.target.checked)} />
              IGST
            </label>
          )}
          {billFormat === 'tax_invoice' && !autoTax && (
            <label>
              Tax
              <input className="input" type="number" step="0.01" value={tax} onChange={(e) => setTax(parseNumericField(e.target.value))} />
            </label>
          )}
        </div>
        <p className="muted old-bill-preview">
          Total {preview.total.toFixed(2)} · Tax {preview.tax.toFixed(2)} · Balance{' '}
          {Math.max(0, preview.total - numericFieldToNumber(amountPaid)).toFixed(2)}
        </p>
        <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save old bill'}
        </button>
      </div>
    </div>
  )
}
