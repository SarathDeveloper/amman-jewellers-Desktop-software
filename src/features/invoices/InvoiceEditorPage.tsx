import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Circle,
  CircleDot,
  Eye,
  FileDown,
  Gem,
  Hash,
  IndianRupee,
  Link2,
  MapPin,
  Percent,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react'
import { paymentStatusFor, suggestRoundOff } from '@shared/billing/billSummary'
import { DEFAULT_BILL_TEMPLATE } from '@shared/billTemplate'
import { roundMoney } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DateInput } from '../../components/DateInput'
import { useToast } from '../../components/toastContext'
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatInr, formatPaymentMode } from '../../lib/format'
import type {
  BillFormat,
  Customer,
  Invoice,
  MetalRates,
  MixedPaymentPart,
  OldGoldItem,
  OldGoldPurchaseLink,
  PaymentMode,
  Product,
} from '@shared/types'
import { api } from '../../lib/api'
import { InvoicePreviewModal } from './InvoicePreviewModal'
import { InvoiceSuccessModal } from './InvoiceSuccessModal'
import { BillSummaryCard } from './BillSummaryCard'
import { MixedPaymentEditor } from './MixedPaymentEditor'
import { BILL_PAYMENT_MODES, PaymentModeSelect } from './PaymentModeSelect'
import { RecordPaymentModal } from './RecordPaymentModal'
import { OldGoldBillLinker } from './OldGoldBillLinker'
import { numericFieldToNumber, parseNumericField, type NumericField } from '../../lib/numericField'
import {
  billingTypeFromPath,
  saleDetailPathForFormat,
  salePathForFormat,
  setBillingType,
  type SaleBillingType,
} from './billingType'
import { BillCustomerSearch } from './BillCustomerSearch'
import { BillProductSearch } from './BillProductSearch'
import {
  applyCurrentMetalRate,
  applyProductToLine,
  computeEditorLineTotal,
  computeEditorTotals,
  computeSaleBreakdown,
  editorLineFromInvoiceItem,
  ensureTrailingEmptyLine,
  forgetHeldBill,
  isEmptyEditorLine,
  newEditorLine,
  puritiesForMetal,
  rateForSalePurity,
  inferSalePurity,
  toInvoiceItems,
  vamcPatch,
  vamcValue,
  type EditorLine,
} from './invoiceEditorHelpers'

function pageTitle(billingType: SaleBillingType, invoiceNo?: string, editingExisting?: boolean): string {
  if (invoiceNo) return invoiceNo
  if (editingExisting) return 'Bill'
  return billingType === 'tax_invoice' ? 'New Tax Invoice' : 'New Cash Bill'
}

function saleTypeFromPath(pathname: string): SaleBillingType {
  const fromPath = billingTypeFromPath(pathname)
  return fromPath === 'tax_invoice' ? 'tax_invoice' : 'cash_bill'
}

function setDirtyFlag(dirty: boolean) {
  window.dispatchEvent(new CustomEvent('billing-editor-dirty', { detail: { dirty } }))
}

function weightInputValue(weight: number | NumericField): number | '' {
  return weight === 0 ? '' : weight
}

function customerCode(id: number): string {
  return `CUST-${String(id).padStart(4, '0')}`
}

function LineProductIcon({ name, category, metal }: { name: string; category?: string; metal?: string }) {
  const key = `${category ?? ''} ${name}`.toLowerCase()
  const size = 16
  if (key.includes('chain')) return <Link2 size={size} strokeWidth={1.75} />
  if (key.includes('ring')) return <Circle size={size} strokeWidth={1.75} />
  if (key.includes('ear') || key.includes('stud')) return <Sparkles size={size} strokeWidth={1.75} />
  if (key.includes('anklet') || key.includes('bangle')) return <CircleDot size={size} strokeWidth={1.75} />
  if (metal?.toLowerCase().includes('silver')) return <Gem size={size} strokeWidth={1.75} />
  return <Gem size={size} strokeWidth={1.75} />
}

export function InvoiceEditorPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const isNew = !id
  const billingType = saleTypeFromPath(location.pathname)
  const billFormat: BillFormat = billingType === 'tax_invoice' ? 'tax_invoice' : 'cash_bill'
  const listPath = '/billing'
  const { showToast } = useToast()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [metalRates, setMetalRates] = useState<MetalRates | null>(null)
  const [lookupsLoaded, setLookupsLoaded] = useState(false)
  const [customerId, setCustomerId] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(localTodayIso())
  const [tax, setTax] = useState<NumericField>(0)
  const [discount, setDiscount] = useState<NumericField>(0)
  const [autoTax, setAutoTax] = useState(true)
  const useIgst = false
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash')
  const [amountPaid, setAmountPaid] = useState<number | ''>('')
  const [mixedPayments, setMixedPayments] = useState<MixedPaymentPart[]>([])
  const [oldGoldLinks, setOldGoldLinks] = useState<OldGoldPurchaseLink[]>([])
  const [legacyOldGold, setLegacyOldGold] = useState<OldGoldItem[]>([])
  const [roundOff, setRoundOff] = useState(0)
  const [roundOffTouched, setRoundOffTouched] = useState(false)
  const [isEstimate, setIsEstimate] = useState(false)
  const [lines, setLines] = useState<EditorLine[]>([newEditorLine()])
  const [successInvoice, setSuccessInvoice] = useState<Invoice | null>(null)
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [previewInvoiceNo, setPreviewInvoiceNo] = useState('')

  const isDetailView = location.pathname.endsWith('/detail')
  const isDraft = invoice?.status !== 'final'
  const canEdit = isDraft && !isDetailView
  const busy = saving || previewing
  const selectedCustomer = customers.find((c) => c.id === customerId)
  const displayBillNo = invoice?.invoiceNo || previewInvoiceNo || '…'

  const oldGoldInputs = useMemo(
    () =>
      legacyOldGold.map((item) => ({
        description: item.description,
        grossWeight: item.grossWeight,
        stoneWeight: item.stoneWeight,
        netWeight: item.netWeight,
        purity: item.purity,
        ratePerGram: item.ratePerGram,
        deductionPct: item.deductionPct,
        finalValue: item.finalValue,
      })),
    [legacyOldGold],
  )
  const linkedOldGoldTotal = useMemo(
    () => oldGoldLinks.reduce((sum, link) => sum + link.amountApplied, 0),
    [oldGoldLinks],
  )
  const totalsBase = useMemo(
    () =>
      computeEditorTotals(
        lines,
        numericFieldToNumber(discount),
        autoTax && billFormat === 'tax_invoice',
        useIgst,
        numericFieldToNumber(tax),
        oldGoldInputs,
        0,
        linkedOldGoldTotal,
      ),
    [lines, discount, autoTax, billFormat, useIgst, tax, oldGoldInputs, linkedOldGoldTotal],
  )
  const appliedRoundOff = roundOffTouched ? roundOff : suggestRoundOff(totalsBase.amountBeforeRoundOff)
  const totals = useMemo(
    () => ({
      ...totalsBase,
      roundOff: appliedRoundOff,
      amountPayable: roundMoney(totalsBase.amountBeforeRoundOff + appliedRoundOff),
    }),
    [totalsBase, appliedRoundOff],
  )
  const saleBreakdown = useMemo(() => computeSaleBreakdown(lines), [lines])
  const paidDisplay =
    paymentMode === 'mixed'
      ? mixedPayments.reduce((sum, part) => sum + part.amount, 0)
      : amountPaid === ''
        ? paymentMode === 'cash'
          ? totals.amountPayable
          : 0
        : amountPaid
  const balanceDisplay = Math.max(0, totals.amountPayable - paidDisplay)
  const payStatus = paymentStatusFor(totals.amountPayable, paidDisplay, totals.invoiceTotal)

  useEffect(() => {
    setBillingType(billingType)
  }, [billingType])

  useEffect(() => {
    if (!isNew || invoice?.invoiceNo) return
    let active = true
    void (async () => {
      try {
        const next = await api.getNextInvoiceNo(billFormat)
        if (active) setPreviewInvoiceNo(next.invoiceNo)
      } catch {
        if (active) setPreviewInvoiceNo('')
      }
    })()
    return () => {
      active = false
    }
  }, [isNew, invoice?.invoiceNo, billFormat])

  useEffect(() => {
    setDirtyFlag(dirty)
    return () => setDirtyFlag(false)
  }, [dirty])

  useEffect(() => {
    if (!metalRates || !canEdit) return
    setLines((current) => {
      const next = current.map((line) => applyCurrentMetalRate(line, metalRates))
      return next.some((line, index) => line !== current[index]) ? next : current
    })
  }, [metalRates, canEdit])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [customerList, productList, latestRates] = await Promise.all([
          api.listCustomers(),
          api.listProducts(),
          api.getLatestMetalRates(),
        ])
        if (!active) return
        setCustomers(customerList)
        setProducts(productList)
        setMetalRates(latestRates)
        setLookupsLoaded(true)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load data')
          setLookupsLoaded(true)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (isNew || !id) return
    let active = true
    void (async () => {
      try {
        const data = await api.getInvoice(Number(id))
        if (!active) return
        setInvoice(data)
        setCustomerId(data.customerId)
        setCustomerName(data.customerName ?? '')
        setCustomerPhone(data.customerPhone ?? '')
        setInvoiceDate(data.invoiceDate)
        setTax(data.tax)
        setDiscount(data.discount)
        setPaymentMode(data.paymentMode)
        setAmountPaid(data.amountPaid)
        setIsEstimate(data.isEstimate)
        setAutoTax(data.billFormat === 'tax_invoice')
        setRoundOff(data.roundOff ?? 0)
        setRoundOffTouched(true)
        if (data.billFormat !== billFormat) {
          const format = data.billFormat === 'tax_invoice' ? 'tax_invoice' : 'cash_bill'
          navigate(
            isDetailView || data.status === 'final'
              ? saleDetailPathForFormat(format, data.id)
              : salePathForFormat(format, data.id),
            { replace: true },
          )
          return
        }
        if (!isDetailView && data.status === 'final') {
          navigate(saleDetailPathForFormat(data.billFormat, data.id), { replace: true })
          return
        }

        const customer = customers.find(c => c.id === data.customerId)
        if (customer) {
          setCustomerAddress(customer.address ?? '')
        }

        const saleItems = data.items.filter((item) => item.lineKind !== 'exchange')
        const exchangeItems = data.items.filter((item) => item.lineKind === 'exchange')
        const canFillRates = data.status !== 'final' && !isDetailView
        const mappedLines =
          saleItems.length > 0
            ? saleItems.map((item) => {
                const line = editorLineFromInvoiceItem(
                  item,
                  products.find((product) => product.id === item.productId),
                )
                return canFillRates ? applyCurrentMetalRate(line, metalRates) : line
              })
            : [newEditorLine()]
        setLines(data.status !== 'final' ? ensureTrailingEmptyLine(mappedLines) : mappedLines)
        setOldGoldLinks(data.oldGoldLinks ?? [])
        if ((data.oldGold ?? []).length > 0) {
          setLegacyOldGold(data.oldGold)
        } else if (exchangeItems.length > 0) {
          setLegacyOldGold(
            exchangeItems.map((item) => ({
              id: item.id,
              invoiceId: data.id,
              description: item.description || item.productName || 'Old gold exchange',
              grossWeight: item.grossWeight || item.netWeight || 0,
              stoneWeight: item.stoneWeight || 0,
              netWeight: item.netWeight || 0,
              purity: item.metal?.toLowerCase().includes('silver') ? 'Silver' : '22K',
              ratePerGram: item.metalRate || item.rate || 0,
              deductionPct: 0,
              grossValue: Math.abs(item.lineTotal),
              deductionAmount: 0,
              finalValue: Math.abs(item.lineTotal),
            })),
          )
        } else {
          setLegacyOldGold([])
        }
        setMixedPayments([])
        setDirty(false)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load invoice')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [isNew, id, billFormat, navigate, customers, products, isDetailView])

  function markDirty() {
    setDirty(true)
  }

  function applyCustomerBorrower(customer: Customer) {
    setCustomerId(customer.id)
    setCustomerName(customer.name ?? '')
    setCustomerPhone(customer.phone ?? '')
    setCustomerAddress(customer.address ?? '')
    markDirty()
  }

  function clearBorrower() {
    setCustomerId(0)
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    markDirty()
  }

  function updateLine(key: string, patch: Partial<EditorLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
    markDirty()
  }

  function weightPatch(
    line: EditorLine,
    next: { grossWeight?: number; stoneWeight?: number },
  ): Partial<EditorLine> {
    const nextGross = next.grossWeight ?? line.grossWeight ?? 0
    const nextStone = next.stoneWeight ?? line.stoneWeight ?? 0
    const currentNet = numericFieldToNumber(line.netWeight)
    const currentGross = line.grossWeight ?? 0
    const currentStone = line.stoneWeight ?? 0
    const derived = Math.max(0, currentGross - currentStone)
    const followNet = currentNet === 0 || currentNet === derived
    return {
      ...(next.grossWeight !== undefined ? { grossWeight: nextGross } : {}),
      ...(next.stoneWeight !== undefined ? { stoneWeight: nextStone } : {}),
      ...(followNet ? { netWeight: Math.max(0, nextGross - nextStone) || '' } : {}),
    }
  }

  function addLine() {
    setLines((current) => ensureTrailingEmptyLine(current))
    markDirty()
  }

  function applyProduct(product: Product) {
    setLines((current) => {
      const patch = applyProductToLine(product, 1, metalRates)
      const emptyIndex = current.findIndex(isEmptyEditorLine)
      const next =
        emptyIndex >= 0
          ? current.map((line, index) => (index === emptyIndex ? { ...line, ...patch } : line))
          : [...current, { ...newEditorLine(), ...patch }]
      return canEdit ? ensureTrailingEmptyLine(next) : next
    })
    markDirty()
  }

  function removeLine(key: string) {
    setLines((current) => {
      const next = current.filter((line) => line.key !== key)
      const remaining = next.length > 0 ? next : [newEditorLine()]
      return canEdit ? ensureTrailingEmptyLine(remaining) : remaining
    })
    markDirty()
  }

  async function ensureCustomerId(): Promise<number> {
    const name = customerName.trim()
    if (!name) throw new Error('Enter customer name')

    const existing = selectedCustomer
    if (existing) {
      const updated = await api.updateCustomer(existing.id, {
        name,
        phone: customerPhone.replace(/\D/g, '').slice(0, 10),
        address: customerAddress.trim(),
        guardianName: existing.guardianName ?? '',
        notes: existing.notes ?? '',
        gstin: existing.gstin ?? '',
        aadhaar: existing.aadhaar ?? '',
        pan: existing.pan ?? '',
      })
      setCustomers((current) => current.map((row) => (row.id === updated.id ? updated : row)))
      setCustomerId(updated.id)
      return updated.id
    }

    const created = await api.createCustomer({
      name,
      phone: customerPhone.replace(/\D/g, '').slice(0, 10),
      address: customerAddress.trim(),
      guardianName: '',
      notes: '',
      gstin: '',
      aadhaar: '',
      pan: '',
    })
    setCustomers((current) => [created, ...current])
    setCustomerId(created.id)
    return created.id
  }

  async function buildPayload(isEstimateFlag = isEstimate) {
    const paid = paymentMode === 'mixed' ? paidDisplay : amountPaid === '' ? undefined : amountPaid
    const resolvedCustomerId = await ensureCustomerId()
    return {
      customerId: resolvedCustomerId,
      invoiceDate,
      tax: autoTax && billFormat === 'tax_invoice' ? totals.tax : numericFieldToNumber(tax),
      items: toInvoiceItems(lines.filter((line) => line.lineKind !== 'exchange')),
      billFormat,
      paymentMode,
      amountPaid: paid,
      discount: numericFieldToNumber(discount),
      autoTax: autoTax && billFormat === 'tax_invoice',
      useIgst,
      isEstimate: isEstimateFlag,
      oldGold: oldGoldInputs,
      oldGoldLinks: oldGoldLinks.map((link) => ({ purchaseId: link.purchaseId })),
      roundOff: appliedRoundOff,
      mixedPayments: paymentMode === 'mixed' ? mixedPayments.filter((part) => part.amount > 0) : undefined,
    }
  }

  async function validatePayload() {
    const payload = await buildPayload()
    if (!payload.customerId || payload.items.length === 0) {
      throw new Error('Select a customer and at least one product line')
    }
    if (totals.amountPayable < -0.009) {
      throw new Error('Amount payable cannot be negative')
    }
    if (
      Math.abs(appliedRoundOff) > 0 &&
      Math.abs(totals.amountBeforeRoundOff) > 0 &&
      Math.abs(appliedRoundOff) >= Math.abs(totals.amountBeforeRoundOff)
    ) {
      throw new Error('Round off must be smaller than the amount before round off')
    }
    const paid = payload.amountPaid ?? (paymentMode === 'cash' ? totals.amountPayable : 0)
    if (paid - totals.amountPayable > 0.009) {
      throw new Error('Amount paid cannot be more than the amount payable')
    }
    if (paymentMode === 'mixed') {
      const mixedTotal = mixedPayments.reduce((sum, part) => sum + part.amount, 0)
      if (mixedTotal - totals.amountPayable > 0.009) {
        throw new Error('Mixed payment parts cannot exceed the amount payable')
      }
    }
    for (const item of oldGoldInputs) {
      if (item.netWeight > item.grossWeight) {
        throw new Error('Old gold net weight cannot exceed gross weight')
      }
    }
    return payload
  }

  function applySavedOldGold(saved: Invoice) {
    setInvoice(saved)
    setOldGoldLinks(saved.oldGoldLinks ?? [])
    setLegacyOldGold(saved.oldGold ?? [])
  }

  async function persistDraft(): Promise<Invoice> {
    const payload = await validatePayload()
    if (isNew && !invoice?.id) {
      const created = await api.createInvoice(payload)
      applySavedOldGold(created)
      setDirty(false)
      navigate(salePathForFormat(billingType, created.id))
      return created
    }
    const targetId = invoice?.id ?? Number(id)
    const updated = await api.updateInvoice({ id: targetId, ...payload })
    applySavedOldGold(updated)
    setDirty(false)
    return updated
  }

  async function saveDraft() {
    try {
      setSaving(true)
      setError(null)
      await persistDraft()
      showToast('Draft saved', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice')
    } finally {
      setSaving(false)
    }
  }

  async function finalize(): Promise<Invoice | null> {
    try {
      setSaving(true)
      setError(null)
      const payload = await validatePayload()

      let targetId = invoice?.id ?? (id ? Number(id) : 0)
      if (!targetId) {
        const created = await api.createInvoice(payload)
        targetId = created.id
        applySavedOldGold(created)
        navigate(salePathForFormat(billingType, created.id))
      } else if (isDraft) {
        const updated = await api.updateInvoice({ id: targetId, ...payload })
        applySavedOldGold(updated)
      }

      const finalized = await api.finalizeInvoice(targetId)
      applySavedOldGold(finalized)
      setDirty(false)
      forgetHeldBill(billFormat, targetId)
      setSuccessInvoice(finalized)
      showToast('Bill finalized', 'success')
      return finalized
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize invoice')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function ensureInvoiceSavedForBill(): Promise<Invoice> {
    if (invoice?.id) {
      if (isDraft) {
        const payload = await validatePayload()
        const updated = await api.updateInvoice({ id: invoice.id, ...payload })
        applySavedOldGold(updated)
        setDirty(false)
        return updated
      }
      return invoice
    }
    return persistDraft()
  }

  async function handlePrint() {
    await openInAppPreview()
  }

  async function handleExportPdf() {
    await openInAppPreview()
  }

  async function openInAppPreview() {
    try {
      setPreviewing(true)
      setError(null)
      const saved = await ensureInvoiceSavedForBill()
      setInvoice(saved)
      setPreviewOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview bill')
    } finally {
      setPreviewing(false)
    }
  }

  function resetBill() {
    setCustomerId(0)
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setLines([newEditorLine()])
    setOldGoldLinks([])
    setLegacyOldGold([])
    setDiscount(0)
    setTax(0)
    setAmountPaid('')
    setMixedPayments([])
    setRoundOff(0)
    setRoundOffTouched(false)
    setResetConfirm(false)
    setError(null)
    setDirty(true)
  }

  const statusLabel =
    invoice?.status === 'final'
      ? payStatus === 'paid'
        ? 'Paid'
        : payStatus === 'partial'
          ? 'Partial'
          : 'Unpaid'
      : invoice?.isEstimate
        ? 'Estimate'
        : 'Draft'

  return (
    <div className="adagu-editor-container sale-bill-editor">
      <header className="adagu-page-header sale-bill-toolbar">
        <div className="adagu-header-left">
          <div className="adagu-header-icon">
            {billingType === 'tax_invoice' ? <Percent size={18} strokeWidth={1.75} /> : <Wallet size={18} strokeWidth={1.75} />}
          </div>
          <div className="adagu-header-titles">
            <h1>{pageTitle(billingType, invoice?.invoiceNo, !isNew)}</h1>
          </div>
          <div className="sale-bill-meta">
            <label className="sale-bill-meta-field">
              <span>Bill Date</span>
              <DateInput
                disabled={!canEdit || busy}
                value={invoiceDate}
                ariaLabel="Bill Date"
                onChange={(value) => {
                  setInvoiceDate(value || localTodayIso())
                  markDirty()
                }}
              />
            </label>
            <div className="sale-bill-meta-field">
              <span>Bill No.</span>
              <input type="text" value={displayBillNo} disabled />
            </div>
            <div className="sale-bill-meta-field">
              <span>Status</span>
              <span className={`adagu-status-dot${isDraft ? ' active' : ''}`} aria-hidden />
              <strong className="sale-bill-meta-status">{statusLabel}</strong>
            </div>
          </div>
        </div>
        <div className="adagu-header-actions">
          <Link to={listPath} className="btn ghost">
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> Back
          </Link>
          {canEdit ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setResetConfirm(true)}>
              <RotateCcw size={16} /> Reset
            </button>
          ) : null}
          {invoice && (
            <>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => void openInAppPreview()}>
                <Eye size={16} strokeWidth={1.75} aria-hidden /> {previewing ? 'Opening…' : 'Preview'}
              </button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => void handlePrint()}>
                <Printer size={16} strokeWidth={1.75} aria-hidden /> Print
              </button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => void handleExportPdf()}>
                <FileDown size={16} strokeWidth={1.75} aria-hidden /> PDF
              </button>
            </>
          )}
          {canEdit && (
            <>
              <button type="button" className="btn secondary" disabled={busy} onClick={() => void saveDraft()}>
                <Save size={16} strokeWidth={1.75} aria-hidden /> Save draft
              </button>
              <button type="button" className="btn" disabled={busy || isEstimate} onClick={() => void finalize()}>
                <Check size={16} strokeWidth={2} aria-hidden /> Finalize
              </button>
            </>
          )}
          {!isDraft && invoice && invoice.balanceDue > 0 && (
            <button type="button" className="btn" disabled={busy} onClick={() => setRecordPaymentOpen(true)}>
              <IndianRupee size={16} strokeWidth={1.75} aria-hidden /> Record Payment
            </button>
          )}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {lookupsLoaded && !metalRates && !error ? (
        <div className="error-banner">
          Metal rates not configured. Go to the Metal Rates page to set today&apos;s gold and silver rates.
        </div>
      ) : null}

      <div className="sale-bill-grid">
        <div className="adagu-grid-col sale-bill-main">
          <div className="adagu-design-card adagu-design-card--has-search">
            <div className="adagu-card-header sale-bill-customer-header">
              <div className="adagu-card-title-group">
                <div className="adagu-card-icon">
                  <User size={16} strokeWidth={1.75} />
                </div>
                <div className="adagu-card-titles">
                  <h2>Customer</h2>
                </div>
              </div>
              <div className="sale-bill-customer-search-wrap">
                <BillCustomerSearch
                  customers={customers}
                  customerId={customerId}
                  disabled={!canEdit || busy}
                  hideLabel
                  hideSelectedMeta
                  keepSearchEmpty
                  addButtonLabel="New"
                  onSelect={(customer) => applyCustomerBorrower(customer)}
                  onClear={clearBorrower}
                  onCustomerCreated={(customer) => {
                    setCustomers((current) => [customer, ...current])
                    applyCustomerBorrower(customer)
                  }}
                  onError={(msg) => setError(msg)}
                />
              </div>
            </div>

            {customerId > 0 || customerName ? (
              <div className="sale-bill-customer-chips">
                <span className="sale-bill-chip sale-bill-chip--name">
                  <User size={13} strokeWidth={1.75} aria-hidden />
                  {customerName || 'Customer'}
                  {canEdit ? (
                    <button type="button" className="sale-bill-chip-clear" aria-label="Clear customer" onClick={clearBorrower}>
                      <X size={12} />
                    </button>
                  ) : null}
                </span>
                {customerPhone ? (
                  <span className="sale-bill-chip">
                    <Phone size={13} strokeWidth={1.75} aria-hidden />
                    {customerPhone}
                  </span>
                ) : null}
                {customerId > 0 ? (
                  <span className="sale-bill-chip">
                    <Hash size={13} strokeWidth={1.75} aria-hidden />
                    {customerCode(customerId)}
                  </span>
                ) : null}
                {customerAddress ? (
                  <span className="sale-bill-chip sale-bill-chip--address">
                    <MapPin size={13} strokeWidth={1.75} aria-hidden />
                    {customerAddress}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="adagu-design-card adagu-design-card--items-panel adagu-design-card--has-search">
            <div className="adagu-card-header sale-bill-items-header">
              <div className="adagu-card-title-group">
                <div className="adagu-card-icon">
                  <Gem size={16} strokeWidth={1.75} />
                </div>
                <div className="adagu-card-titles">
                  <h2>Items</h2>
                </div>
              </div>
              <div className="sale-bill-items-search-wrap">
                <BillProductSearch
                  products={products}
                  disabled={!canEdit || busy}
                  hideLabel
                  hideAddButton
                  compact
                  placeholder="Search product by name, metal, category, SKU…"
                  onSelect={applyProduct}
                  onProductCreated={(product) => {
                    setProducts((current) => [product, ...current])
                    applyProduct(product)
                  }}
                  onError={(msg) => setError(msg)}
                />
              </div>
              <button type="button" className="adagu-btn-add-item" disabled={!canEdit || busy} onClick={addLine}>
                <Plus size={14} /> Add Item
              </button>
            </div>

            <div className="adagu-jewellery-table-wrap sale-bill-items-wrap">
              <table className="adagu-jewellery-table sale-bill-items-table">
                <thead>
                  <tr>
                    <th className="adagu-col-index">#</th>
                    <th className="adagu-col-particular">{DEFAULT_BILL_TEMPLATE.taxColParticulars}</th>
                    <th className="adagu-col-purity">Purity</th>
                    <th className="adagu-col-net-weight">{DEFAULT_BILL_TEMPLATE.taxColTotWgt}</th>
                    <th className="adagu-col-weight">{DEFAULT_BILL_TEMPLATE.taxColGrsWgt}</th>
                    <th className="adagu-col-stone-weight">{DEFAULT_BILL_TEMPLATE.taxColStnWgt}</th>
                    <th className="adagu-col-wastage">{DEFAULT_BILL_TEMPLATE.taxColVamc}</th>
                    <th className="adagu-col-stone-rate">{DEFAULT_BILL_TEMPLATE.taxColStoneRate}</th>
                    <th className="adagu-col-rate">{DEFAULT_BILL_TEMPLATE.taxColMetalRate}</th>
                    <th className="adagu-col-amount">{DEFAULT_BILL_TEMPLATE.taxColAmount}</th>
                    <th className="adagu-col-action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const empty = isEmptyEditorLine(line)
                    if (empty) return null
                    const purity = line.purity || inferSalePurity(line.metal)
                    return (
                      <tr key={line.key} className={empty ? 'sale-bill-empty-row' : undefined}>
                        <td className="adagu-col-index">{index + 1}</td>
                        <td className="adagu-col-particular">
                          <div className="sale-bill-product-cell">
                              <span className="sale-bill-product-icon" aria-hidden>
                                <LineProductIcon name={line.description} category={line.category} metal={line.metal} />
                              </span>
                              <div className="sale-bill-product-copy">
                                <input
                                  className="sale-bill-product-name"
                                  disabled={!canEdit || busy}
                                  value={line.description}
                                  onChange={(event) => updateLine(line.key, { description: event.target.value })}
                                  placeholder="Item name"
                                />
                                <div className="sale-bill-product-meta">
                                  <span>{line.category || line.metal || 'Item'}</span>
                                </div>
                              </div>
                            </div>
                        </td>
                        <td className="adagu-col-purity">
                          {empty ? null : (
                            <select
                              className="sale-bill-purity"
                              disabled={!canEdit || busy}
                              value={purity}
                              onChange={(event) => {
                                const nextPurity = event.target.value
                                const nextRate = rateForSalePurity(nextPurity, metalRates, line.metal)
                                updateLine(line.key, {
                                  purity: nextPurity,
                                  metalRate: nextRate,
                                  rate: nextRate,
                                  metalRateAuto: true,
                                })
                              }}
                            >
                              {puritiesForMetal(line.metal, purity).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="adagu-col-net-weight">
                          {empty ? null : (
                            <div className="adagu-input-with-icon">
                              <input
                                type="number"
                                step="0.001"
                                disabled={!canEdit || busy}
                                value={weightInputValue(line.netWeight ?? 0)}
                                onChange={(event) =>
                                  updateLine(line.key, { netWeight: parseNumericField(event.target.value) })
                                }
                              />
                            </div>
                          )}
                        </td>
                        <td className="adagu-col-weight">
                          {empty ? null : (
                            <div className="adagu-input-with-icon">
                              <input
                                type="number"
                                step="0.001"
                                disabled={!canEdit || busy}
                                value={weightInputValue(line.grossWeight ?? 0)}
                                onChange={(event) => {
                                  const nextGross = numericFieldToNumber(parseNumericField(event.target.value))
                                  updateLine(line.key, weightPatch(line, { grossWeight: nextGross }))
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="adagu-col-stone-weight">
                          {empty ? null : (
                            <div className="adagu-input-with-icon">
                              <input
                                type="number"
                                step="0.001"
                                disabled={!canEdit || busy}
                                value={weightInputValue(line.stoneWeight ?? 0)}
                                onChange={(event) => {
                                  const nextStone = numericFieldToNumber(parseNumericField(event.target.value))
                                  updateLine(line.key, weightPatch(line, { stoneWeight: nextStone }))
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="adagu-col-wastage">
                          {empty ? null : (
                            <div className="adagu-input-with-icon sale-bill-vamc">
                              <input
                                type="number"
                                step="0.01"
                                disabled={!canEdit || busy}
                                value={weightInputValue(vamcValue(line))}
                                onChange={(event) =>
                                  updateLine(
                                    line.key,
                                    vamcPatch(line, {
                                      value: numericFieldToNumber(parseNumericField(event.target.value)),
                                    }),
                                  )
                                }
                              />
                              <div className="sale-bill-vamc-toggle" role="group" aria-label="VA/MC unit">
                                <button
                                  type="button"
                                  className={line.vamcMode === 'pct' ? 'active' : undefined}
                                  disabled={!canEdit || busy}
                                  onClick={() => updateLine(line.key, vamcPatch(line, { mode: 'pct' }))}
                                >
                                  %
                                </button>
                                <button
                                  type="button"
                                  className={line.vamcMode === 'amount' ? 'active' : undefined}
                                  disabled={!canEdit || busy}
                                  onClick={() => updateLine(line.key, vamcPatch(line, { mode: 'amount' }))}
                                >
                                  ₹
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="adagu-col-stone-rate">
                          {empty ? null : (
                            <div className="adagu-input-with-icon">
                              <input
                                type="number"
                                step="0.01"
                                disabled={!canEdit || busy}
                                value={weightInputValue(line.stoneRate ?? 0)}
                                onChange={(event) =>
                                  updateLine(line.key, {
                                    stoneRate: numericFieldToNumber(parseNumericField(event.target.value)),
                                  })
                                }
                              />
                            </div>
                          )}
                        </td>
                        <td className="adagu-col-rate">
                          {empty ? null : (
                            <div className="adagu-input-with-icon">
                              <input
                                type="number"
                                step="0.01"
                                disabled={!canEdit || busy}
                                aria-label={
                                  line.metal?.toLowerCase().includes('silver') ? 'Silver rate' : 'Gold rate'
                                }
                                value={weightInputValue(line.metalRate ?? line.rate)}
                                onChange={(event) => {
                                  const value = parseNumericField(event.target.value)
                                  updateLine(line.key, { metalRate: value, rate: value, metalRateAuto: false })
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="adagu-col-amount">
                          {empty ? null : formatInr(computeEditorLineTotal(line))}
                        </td>
                        <td className="adagu-col-action">
                          {empty ? null : (
                            <button
                              type="button"
                              className="adagu-action-btn-red"
                              aria-label="Remove item"
                              disabled={!canEdit || busy}
                              onClick={() => removeLine(line.key)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <OldGoldBillLinker
            links={oldGoldLinks}
            legacyItems={legacyOldGold}
            disabled={!canEdit || busy}
            currentInvoiceId={invoice?.id ?? null}
            onChange={(next) => {
              setOldGoldLinks(next)
              markDirty()
            }}
            onLegacyChange={(next) => {
              setLegacyOldGold(next)
              markDirty()
            }}
          />
        </div>

        <div className="adagu-grid-col sale-bill-rail">
          <BillSummaryCard
            summary={totals}
            jewelleryValue={saleBreakdown.jewelleryValue}
            wastageAmount={saleBreakdown.wastageAmount}
            makingCharges={saleBreakdown.makingCharges}
            otherCharges={saleBreakdown.otherCharges}
            itemCount={saleBreakdown.itemCount}
            totalGrossWeight={saleBreakdown.totalGrossWeight}
            showTax={billFormat === 'tax_invoice'}
            disabled={!canEdit || busy}
            discount={numericFieldToNumber(discount)}
            onDiscountChange={(value) => {
              setDiscount(value)
              markDirty()
            }}
            onRoundOffChange={(value) => {
              setRoundOffTouched(true)
              setRoundOff(value)
              markDirty()
            }}
          />

          <div className="adagu-design-card sale-bill-payment-card">
            <div className="adagu-card-header">
              <div className="adagu-card-title-group">
                <div
                  className="adagu-card-icon"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  <IndianRupee size={14} strokeWidth={1.75} />
                </div>
                <div className="adagu-card-titles">
                  <h2>Payment Details</h2>
                </div>
              </div>
            </div>

            <div className="payment-highlights">
              <div className="payment-highlight payment-highlight--payable">
                <span>Amount Payable</span>
                <strong>{formatCurrency(totals.amountPayable)}</strong>
              </div>
              <div className="payment-highlight payment-highlight--paid">
                <span>Amount Paid</span>
                <strong>{formatCurrency(paidDisplay)}</strong>
              </div>
              <div className="payment-highlight payment-highlight--due">
                <span>Balance Due</span>
                <strong>{formatCurrency(balanceDisplay)}</strong>
              </div>
            </div>

            <PaymentModeSelect
              value={paymentMode}
              modes={BILL_PAYMENT_MODES}
              disabled={!canEdit || busy}
              onChange={(mode) => {
                setPaymentMode(mode)
                if (mode === 'mixed' && mixedPayments.length === 0 && paidDisplay > 0) {
                  setMixedPayments([{ mode: 'cash', amount: paidDisplay }])
                }
                markDirty()
              }}
            />
            {paymentMode === 'mixed' ? (
              <MixedPaymentEditor
                parts={mixedPayments}
                amountPayable={totals.amountPayable}
                disabled={!canEdit || busy}
                onChange={(parts) => {
                  setMixedPayments(parts)
                  setAmountPaid(parts.reduce((sum, part) => sum + part.amount, 0) || '')
                  markDirty()
                }}
              />
            ) : (
              <div className="adagu-field">
                <label>{paymentMode === 'cash' ? 'Cash Received' : 'Amount Paid'}</label>
                <div className="adagu-input-with-icon">
                  <IndianRupee size={14} className="input-icon" />
                  <input
                    type="number"
                    size={1}
                    step="0.01"
                    disabled={!canEdit || busy}
                    value={amountPaid}
                    onChange={(event) => {
                      setAmountPaid(parseNumericField(event.target.value))
                      markDirty()
                    }}
                    placeholder={paymentMode === 'cash' ? 'Auto full on save' : 'Partial payment'}
                  />
                </div>
              </div>
            )}
          </div>

          {!isDraft && invoice ? (
            <>
              <div className="adagu-design-card">
                <div className="adagu-card-header">
                  <div className="adagu-card-title-group">
                    <div className="adagu-card-icon">
                      <Wallet size={16} strokeWidth={1.75} />
                    </div>
                    <div className="adagu-card-titles">
                      <h2>Payment History</h2>
                      <p>Ledger payments against this bill</p>
                    </div>
                  </div>
                  {invoice.balanceDue > 0 ? (
                    <button type="button" className="adagu-btn-add-item" onClick={() => setRecordPaymentOpen(true)}>
                      <Plus size={14} /> Record Payment
                    </button>
                  ) : null}
                </div>
                {invoice.payments.length === 0 && invoice.amountPaid <= 0 ? (
                  <p className="bill-empty-hint">No payments recorded yet.</p>
                ) : (
                  <div className="sale-bill-history-wrap">
                    <table className="sale-bill-history-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Mode</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(invoice.payments.length > 0
                          ? invoice.payments
                          : [
                              {
                                id: 0,
                                date: invoice.invoiceDate,
                                mode: invoice.paymentMode,
                                amount: invoice.amountPaid,
                                note: 'Recorded on bill',
                                createdAt: invoice.createdAt,
                              },
                            ]
                        ).map((payment) => (
                          <tr key={payment.id || 'initial'}>
                            <td>
                              <span>{formatDisplayDate(payment.date)}</span>
                              {payment.note ? <small>{payment.note}</small> : null}
                            </td>
                            <td>{formatPaymentMode(payment.mode)}</td>
                            <td className="num">{formatCurrency(payment.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="adagu-design-card">
                <div className="adagu-card-header">
                  <div className="adagu-card-title-group">
                    <div className="adagu-card-icon">
                      <User size={16} strokeWidth={1.75} />
                    </div>
                    <div className="adagu-card-titles">
                      <h2>Activity</h2>
                      <p>Created and payment timestamps</p>
                    </div>
                  </div>
                </div>
                <div className="invoice-activity-list">
                  <div>
                    <span>Created</span>
                    <strong>{formatDisplayDateTime(invoice.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Bill date</span>
                    <strong>{formatDisplayDate(invoice.invoiceDate)}</strong>
                  </div>
                  {(invoice.payments.length > 0
                    ? invoice.payments
                    : invoice.amountPaid > 0
                      ? [
                          {
                            id: 0,
                            date: invoice.invoiceDate,
                            mode: invoice.paymentMode,
                            amount: invoice.amountPaid,
                            note: 'Recorded on bill',
                            createdAt: invoice.createdAt,
                          },
                        ]
                      : []
                  ).map((payment) => (
                    <div key={`act-${payment.id || 'initial'}`}>
                      <span>Payment {formatPaymentMode(payment.mode)}</span>
                      <strong>
                        {formatDisplayDateTime(payment.createdAt)} · {formatCurrency(payment.amount)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {resetConfirm && (
        <ConfirmDialog
          title="Reset bill"
          message="Clear customer, lines, and payment fields on this bill?"
          confirmLabel="Reset"
          danger={false}
          onCancel={() => setResetConfirm(false)}
          onConfirm={resetBill}
        />
      )}

      {successInvoice && (
        <InvoiceSuccessModal
          invoice={successInvoice}
          onPrint={() => {
            setInvoice(successInvoice)
            setPreviewOpen(true)
          }}
          onPdf={() => {
            setInvoice(successInvoice)
            setPreviewOpen(true)
          }}
          onView={() => {
            setSuccessInvoice(null)
            navigate(saleDetailPathForFormat(billFormat, successInvoice.id))
          }}
          onNewBill={() => {
            setSuccessInvoice(null)
            navigate(salePathForFormat(billingType))
          }}
          onClose={() => setSuccessInvoice(null)}
        />
      )}

      {previewOpen && invoice && (
        <InvoicePreviewModal
          invoiceId={invoice.id}
          initialFormat={billFormat}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {recordPaymentOpen && invoice && (
        <RecordPaymentModal
          invoice={invoice}
          onClose={() => setRecordPaymentOpen(false)}
          onRecorded={(updated) => {
            setInvoice(updated)
            setAmountPaid(updated.amountPaid)
            setRecordPaymentOpen(false)
            showToast('Payment recorded', 'success')
          }}
        />
      )}
    </div>
  )
}
