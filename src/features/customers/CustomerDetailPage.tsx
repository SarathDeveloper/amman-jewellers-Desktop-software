import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Coins, Eye, FileText, Gift, IndianRupee, Pencil, Printer, Tag, User } from 'lucide-react'
import { invoiceNoLabel } from '@shared/billing/invoiceNumber'
import { localTodayIso } from '@shared/localDate'
import type {
  AdaguDueSummary,
  Customer,
  DuesLedger,
  GoldSavingAccount,
  Invoice,
  OldGoldPurchase,
  Pledge,
  PledgeAuctionInput,
  PledgePaymentMode,
} from '@shared/types'
import { DataTable } from '../../components/DataTable'
import { DateInput } from '../../components/DateInput'
import { LoadingState } from '../../components/LoadingState'
import { Modal } from '../../components/Modal'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge, type StatusKind } from '../../components/StatusBadge'
import { useToast } from '../../components/toastContext'
import { formatCurrency, formatDisplayDate, formatPaymentMode, formatWeight } from '../../lib/format'
import { api } from '../../lib/api'
import { useAuth } from '../auth/authContext'
import { AdaguDueDetailDrawer } from '../dues/AdaguDueDetailDrawer'
import { AuctionModal } from '../dues/AuctionModal'
import { InterestCollectionModal } from '../dues/InterestCollectionModal'
import { PLEDGE_PAYMENT_MODES } from '../dues/pledgePaymentModes'
import { RenewModal } from '../dues/RenewModal'
import { TopupModal } from '../dues/TopupModal'
import { CollectPaymentModal } from '../goldSavings/collections/CollectPaymentModal'
import { GsStatusBadge } from '../goldSavings/GsStatusBadge'
import { BILLING_TAB_OPTIONS, saleDetailPathForFormat, salePathForFormat } from '../invoices/billingType'
import { InvoicePreviewModal } from '../invoices/InvoicePreviewModal'
import { RecordPaymentModal } from '../invoices/RecordPaymentModal'
import { PledgePreviewModal } from '../pledges/PledgePreviewModal'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'
import { CustomerFormModal } from './CustomerFormModal'
import { loadCustomerLoans, loanStatusLabel } from './customerLoans'
import { buildCustomerProfile } from './customerProfile'

const LIST_PAGE_SIZE = 50
const LIST_MAX_PAGES = 20
const PREVIEW_LIMIT = 4

const PROFILE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'adagu', label: 'Active Loans & Adagu' },
  { value: 'schemes', label: 'Active Schemes' },
  { value: 'billing', label: 'Billing History' },
  { value: 'dues', label: 'Dues & Payments' },
  { value: 'oldGold', label: 'Old Gold' },
] as const

type ProfileTab = (typeof PROFILE_TABS)[number]['value']

type CustomerBundle = {
  record: Customer
  invoices: Invoice[]
  loans: Pledge[]
  purchases: OldGoldPurchase[]
  dues: DuesLedger
  schemes: GoldSavingAccount[]
}

async function loadPaged<T>(
  fetchPage: (page: number) => Promise<{ items?: T[]; total?: number }>,
): Promise<T[]> {
  const first = await fetchPage(1)
  const items = [...(first.items ?? [])]
  const total = first.total ?? items.length
  let page = 1
  while (items.length < total && page < LIST_MAX_PAGES) {
    page += 1
    const next = await fetchPage(page)
    const batch = next.items ?? []
    if (batch.length === 0) break
    items.push(...batch)
  }
  return items
}

async function loadCustomerInvoices(customerId: number): Promise<Invoice[]> {
  return loadPaged((page) =>
    api.listInvoices({
      customerId,
      page,
      pageSize: LIST_PAGE_SIZE,
      status: 'all',
      sort: 'desc',
    }),
  )
}

async function loadCustomerBundle(customerId: number, includeSchemes: boolean): Promise<CustomerBundle> {
  const [record, invoices, loans, purchases, dues, schemes] = await Promise.all([
    api.getCustomer(customerId),
    loadCustomerInvoices(customerId),
    loadCustomerLoans(customerId),
    api.listOldGoldPurchases({ customerId }),
    api.listDues(),
    includeSchemes ? api.listGsAccounts().catch(() => [] as GoldSavingAccount[]) : Promise.resolve([] as GoldSavingAccount[]),
  ])
  return {
    record,
    invoices,
    loans,
    purchases,
    dues,
    schemes: schemes.filter((account) => account.customerId === customerId),
  }
}

function invoiceListStatus(invoice: Invoice): StatusKind {
  if (invoice.status === 'cancelled') return 'cancelled'
  if (invoice.isEstimate) return 'estimate'
  if (invoice.status === 'draft') return 'draft'
  if (invoice.balanceDue > 0) return 'due'
  return 'final'
}

function billTypeLabel(format: Invoice['billFormat']): string {
  const type = format === 'tax_invoice' ? 'tax_invoice' : 'cash_bill'
  return BILLING_TAB_OPTIONS.find((tab) => tab.value === type)?.label ?? type
}

function invoiceViewPath(invoice: Invoice): string {
  const format = invoice.billFormat === 'tax_invoice' ? 'tax_invoice' : 'cash_bill'
  return invoice.status === 'draft' && !invoice.isEstimate
    ? salePathForFormat(format, invoice.id)
    : saleDetailPathForFormat(format, invoice.id)
}

function invoiceDisplayNo(invoice: Invoice): string {
  return invoiceNoLabel(invoice.invoiceNo, invoice.isEstimate) ?? invoice.invoiceNo
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

function isCollectableScheme(account: GoldSavingAccount): boolean {
  return account.status === 'active' || account.status === 'matured'
}

export function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { can } = useAuth()
  const customerId = Number(id)
  const includeSchemes = can('gold_savings')

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loans, setLoans] = useState<Pledge[]>([])
  const [oldGold, setOldGold] = useState<OldGoldPurchase[]>([])
  const [ledger, setLedger] = useState<DuesLedger>({ columns: [], totalOutstanding: 0 })
  const [schemes, setSchemes] = useState<GoldSavingAccount[]>([])
  const [loadedId, setLoadedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<ProfileTab>('overview')
  const [busy, setBusy] = useState(false)

  const [viewTarget, setViewTarget] = useState<AdaguDueSummary | null>(null)
  const [billTarget, setBillTarget] = useState<number | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<number | null>(null)
  const [interestTarget, setInterestTarget] = useState<AdaguDueSummary | null>(null)
  const [topupTarget, setTopupTarget] = useState<AdaguDueSummary | null>(null)
  const [renewTarget, setRenewTarget] = useState<AdaguDueSummary | null>(null)
  const [renewedTarget, setRenewedTarget] = useState<number | null>(null)
  const [redeemTarget, setRedeemTarget] = useState<AdaguDueSummary | null>(null)
  const [redeemAction, setRedeemAction] = useState<'partial' | 'full' | null>(null)
  const [redeemDate, setRedeemDate] = useState(localTodayIso())
  const [redeemAmount, setRedeemAmount] = useState(0)
  const [redeemDiscount, setRedeemDiscount] = useState(0)
  const [redeemMode, setRedeemMode] = useState<PledgePaymentMode>('cash')
  const [auctionTarget, setAuctionTarget] = useState<AdaguDueSummary | null>(null)
  const [auctionMode, setAuctionMode] = useState<'notice' | 'auction'>('notice')
  const [noticePrintTarget, setNoticePrintTarget] = useState<number | null>(null)

  const [collectAccountId, setCollectAccountId] = useState<number | null>(null)
  const [printAccountId, setPrintAccountId] = useState<number | null>(null)

  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null)
  const [printOldGoldId, setPrintOldGoldId] = useState<number | null>(null)

  function applyBundle(bundle: CustomerBundle) {
    setCustomer(bundle.record)
    setInvoices(bundle.invoices)
    setLoans(bundle.loans)
    setOldGold(bundle.purchases)
    setLedger(bundle.dues)
    setSchemes(bundle.schemes)
  }

  async function reload(): Promise<DuesLedger> {
    const bundle = await loadCustomerBundle(customerId, includeSchemes)
    applyBundle(bundle)
    return bundle.dues
  }

  async function reloadAndSyncView() {
    const data = await reload()
    setViewTarget((current) => {
      if (!current) return null
      return (data.adaguDues ?? []).find((row) => row.pledgeId === current.pledgeId) ?? null
    })
    return data
  }

  const customerIdValid = Number.isInteger(customerId) && customerId > 0
  const loading = customerIdValid && loadedId !== customerId

  useEffect(() => {
    if (!customerIdValid) return
    let active = true
    void loadCustomerBundle(customerId, includeSchemes)
      .then((bundle) => {
        if (!active) return
        setViewTarget(null)
        setBillTarget(null)
        setReleaseTarget(null)
        setInterestTarget(null)
        setTopupTarget(null)
        setRenewTarget(null)
        setRedeemTarget(null)
        setAuctionTarget(null)
        setCollectAccountId(null)
        setPreviewInvoice(null)
        setPayInvoice(null)
        setPrintOldGoldId(null)
        setTab('overview')
        applyBundle(bundle)
        setError(null)
        setLoadedId(customerId)
      })
      .catch((err: unknown) => {
        if (!active) return
        setCustomer(null)
        setInvoices([])
        setLoans([])
        setOldGold([])
        setLedger({ columns: [], totalOutstanding: 0 })
        setSchemes([])
        setError(err instanceof Error ? err.message : 'Failed to load customer')
        setLoadedId(customerId)
      })
    return () => {
      active = false
    }
  }, [customerId, customerIdValid, includeSchemes])

  const summary = useMemo(
    () =>
      customer
        ? buildCustomerProfile(
            customer.id,
            invoices,
            ledger.columns.find((column) => column.customerId === customer.id),
            oldGold,
          )
        : null,
    [customer, invoices, ledger.columns, oldGold],
  )

  const adaguDues = useMemo(
    () => (ledger.adaguDues ?? []).filter((row) => row.customerId === customerId),
    [ledger.adaguDues, customerId],
  )
  const activeAdagu = useMemo(
    () => adaguDues.filter((row) => row.status === 'active' && row.remaining > 0),
    [adaguDues],
  )
  const activeSchemes = useMemo(() => schemes.filter(isCollectableScheme), [schemes])
  const billedInvoices = useMemo(
    () =>
      [...invoices].sort((a, b) =>
        a.invoiceDate === b.invoiceDate ? b.id - a.id : a.invoiceDate < b.invoiceDate ? 1 : -1,
      ),
    [invoices],
  )

  const isFullRedeem = redeemTarget
    ? Math.round((redeemAmount + redeemDiscount) * 100) >= Math.round(redeemTarget.remaining * 100)
    : false

  function openRedeem(summaryRow: AdaguDueSummary) {
    setRedeemTarget(summaryRow)
    setRedeemDate(localTodayIso())
    setRedeemAmount(summaryRow.remaining)
    setRedeemDiscount(0)
    setRedeemMode('cash')
  }

  async function collectInterest(input: {
    amount: number
    collectedDate: string
    mode: PledgePaymentMode
  }) {
    if (!interestTarget) return
    if (interestTarget.interestDue <= 0.005) {
      setError('No interest is due on this loan')
      return
    }
    try {
      setBusy(true)
      setError(null)
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
      setError(err instanceof Error ? err.message : 'Failed to collect interest')
    } finally {
      setBusy(false)
    }
  }

  async function addTopup(input: { amount: number; topupDate: string; note: string }) {
    if (!topupTarget) return
    try {
      setBusy(true)
      setError(null)
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
      setError(err instanceof Error ? err.message : 'Failed to add extra loan')
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
      setError(null)
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
      setError(err instanceof Error ? err.message : 'Failed to renew loan')
    } finally {
      setBusy(false)
    }
  }

  async function collectPartial() {
    if (!redeemTarget || redeemAmount <= 0) return
    try {
      setRedeemAction('partial')
      setBusy(true)
      setError(null)
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
      setError(err instanceof Error ? err.message : 'Failed to collect')
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
      setError(null)
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
      setError(err instanceof Error ? err.message : 'Failed to close loan')
    } finally {
      setBusy(false)
      setRedeemAction(null)
    }
  }

  async function sendAuctionNotice(input: { noticeDate: string }) {
    if (!auctionTarget) return
    try {
      setBusy(true)
      setError(null)
      await api.sendPledgeAuctionNotice({
        id: auctionTarget.pledgeId,
        noticeDate: input.noticeDate,
      })
      setAuctionTarget(null)
      showToast('Auction notice saved', 'success')
      await reloadAndSyncView()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save auction notice')
    } finally {
      setBusy(false)
    }
  }

  async function recordAuction(input: Omit<PledgeAuctionInput, 'id'>) {
    if (!auctionTarget) return
    try {
      setBusy(true)
      setError(null)
      const updated = await api.recordPledgeAuction({
        id: auctionTarget.pledgeId,
        ...input,
      })
      setAuctionTarget(null)
      showToast(`Auction recorded for ${updated.receiptNo}`, 'success')
      await reloadAndSyncView()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record auction')
    } finally {
      setBusy(false)
    }
  }

  if (!customerIdValid) {
    return (
      <div className="app-page">
        <PageHeader title="Customer" subtitle="Customer details and loan history" />
        <div className="error-banner">{error ?? 'Customer not found'}</div>
        <Link className="btn secondary" to="/customers">
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
          Customers
        </Link>
      </div>
    )
  }

  if (loading || (customer !== null && customer.id !== customerId)) {
    return (
      <div className="app-page">
        <LoadingState />
      </div>
    )
  }

  if (!customer || !summary) {
    return (
      <div className="app-page">
        <PageHeader title="Customer" subtitle="Customer details and loan history" />
        <div className="error-banner">{error ?? 'Customer not found'}</div>
        <Link className="btn secondary" to="/customers">
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
          Customers
        </Link>
      </div>
    )
  }

  const adaguPayments = (row: AdaguDueSummary) =>
    ledger.columns
      .find((column) => column.customerId === row.customerId)
      ?.entries.filter((entry) => entry.pledgeId === row.pledgeId && entry.kind === 'payment') ?? []

  return (
    <div className="app-page customer-detail-page">
      <PageHeader
        title={customer.name}
        subtitle="Customer details and loan history"
        actions={
          <>
            <button type="button" className="btn secondary" onClick={() => navigate('/customers')}>
              <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
              Customers
            </button>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              <Pencil size={16} strokeWidth={1.75} aria-hidden />
              Edit
            </button>
          </>
        }
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="customer-profile-tabs" role="tablist">
        {PROFILE_TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            className={`customer-profile-tab${tab === option.value ? ' active' : ''}`}
            onClick={() => setTab(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="customer-profile-grid">
          <div className="customer-profile-grid-top">
            <ProfileCard
              icon={<User size={18} strokeWidth={1.75} />}
              tone="brand"
              title="Customer Profile"
              subtitle="Basic details and contact information"
            >
              <ProfileFields customer={customer} />
            </ProfileCard>
            <ProfileCard
              icon={<FileText size={18} strokeWidth={1.75} />}
              tone="brand"
              title="Loan History"
              subtitle="All adagu / loan transactions for this customer"
            >
              {loans.length === 0 ? (
                <ProfileEmpty
                  icon={<FileText size={26} strokeWidth={1.75} />}
                  tone="brand"
                  title="No loans yet"
                  text="This customer doesn't have any adagu or loan records at the moment."
                />
              ) : (
                <ul className="customer-profile-preview">
                  {loans.slice(0, PREVIEW_LIMIT).map((loan) => (
                    <li key={loan.id}>
                      <Link to={`/billing/adagu/${loan.id}`}>{loan.receiptNo}</Link>
                      <span>{formatDisplayDate(loan.pledgeDate)}</span>
                      <span className="num">{formatCurrency(loan.loanAmount)}</span>
                      <span>{loanStatusLabel(loan.status)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ProfileCard>
          </div>
          <div className="customer-profile-grid-bottom">
            <ProfileCard
              icon={<Coins size={18} strokeWidth={1.75} />}
              tone="brand"
              title="Active Adagu"
              subtitle="Currently active adagu loans"
            >
              {activeAdagu.length === 0 ? (
                <ProfileEmpty
                  icon={<Coins size={26} strokeWidth={1.75} />}
                  tone="brand"
                  title="No active adagu loans"
                  text="This customer doesn't have any active adagu loans."
                />
              ) : (
                <ul className="customer-profile-preview">
                  {activeAdagu.slice(0, PREVIEW_LIMIT).map((row) => (
                    <li key={row.pledgeId}>
                      <Link to={`/billing/adagu/${row.pledgeId}`}>{row.receiptNo}</Link>
                      <span>{formatDisplayDate(row.pledgeDate)}</span>
                      <span className="num">{formatCurrency(row.remaining)}</span>
                      <span>{row.isInterestOverdue ? 'Interest overdue' : 'Active'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ProfileCard>
            <ProfileCard
              icon={<Gift size={18} strokeWidth={1.75} />}
              tone="pink"
              title="Active Schemes"
              subtitle="Currently active schemes"
            >
              {activeSchemes.length === 0 ? (
                <ProfileEmpty
                  icon={<Gift size={26} strokeWidth={1.75} />}
                  tone="pink"
                  title="No active schemes"
                  text="This customer doesn't have any active schemes."
                />
              ) : (
                <ul className="customer-profile-preview">
                  {activeSchemes.slice(0, PREVIEW_LIMIT).map((account) => (
                    <li key={account.id}>
                      <Link to={`/gold-savings/accounts/${account.id}`}>{account.accountNo}</Link>
                      <span>{formatDisplayDate(account.maturityDate)}</span>
                      <span className="num">{formatWeight(account.goldAccumulated, 3)}</span>
                      <GsStatusBadge status={account.status} />
                    </li>
                  ))}
                </ul>
              )}
            </ProfileCard>
            <ProfileCard
              icon={<Tag size={18} strokeWidth={1.75} />}
              tone="amber"
              title="Old Gold Sold"
              subtitle="Previous old gold purchase records"
            >
              {summary.oldGold.length === 0 ? (
                <ProfileEmpty
                  icon={<Tag size={26} strokeWidth={1.75} />}
                  tone="amber"
                  title="No old gold purchases yet"
                  text="This customer doesn't have any old gold purchases."
                />
              ) : (
                <ul className="customer-profile-preview">
                  {summary.oldGold.slice(0, PREVIEW_LIMIT).map((purchase) => (
                    <li key={purchase.id}>
                      <span>{purchase.purchaseNo}</span>
                      <span>{formatDisplayDate(purchase.date)}</span>
                      <span className="num">{formatCurrency(purchase.amount)}</span>
                      <span>{oldGoldPreviewStatus(purchase)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ProfileCard>
          </div>
        </div>
      ) : null}

      <div className="customer-page-stack">
        {tab === 'adagu' ? (
          <section className="card padded">
            <div className="drawer-section">
              <h3>Active Adagu</h3>
              <AdaguRows
                rows={activeAdagu}
                empty="No active Adagu loans."
                onView={setViewTarget}
                onBill={setBillTarget}
              />
            </div>
            <div className="drawer-section">
              <h3>Loan history</h3>
              <LoanHistoryRows loans={loans} />
            </div>
          </section>
        ) : null}

        {tab === 'schemes' ? (
          <section className="card padded">
            <div className="drawer-section">
              <h3>Active schemes</h3>
              <SchemeRows
                accounts={activeSchemes}
                empty="No active schemes."
                onCollect={setCollectAccountId}
                onPrintPassbook={setPrintAccountId}
              />
            </div>
            <div className="drawer-section">
              <h3>Scheme history</h3>
              <SchemeRows
                accounts={schemes}
                empty="No scheme accounts."
                onCollect={setCollectAccountId}
                onPrintPassbook={setPrintAccountId}
              />
            </div>
          </section>
        ) : null}

        {tab === 'billing' ? (
          <section className="card padded">
            <div className="drawer-section">
              <h3>Billing History</h3>
            </div>
            {billedInvoices.length === 0 ? (
              <p className="muted">No bills yet.</p>
            ) : (
              <DataTable>
                <table>
                  <thead>
                    <tr>
                      <th>Bill No.</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Items</th>
                      <th className="num">Total</th>
                      <th className="num">Paid</th>
                      <th className="num">Balance</th>
                      <th>Payment</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {billedInvoices.map((invoice) => {
                      const viewPath = invoiceViewPath(invoice)
                      const canPay =
                        invoice.status === 'final' && !invoice.isEstimate && invoice.balanceDue > 0
                      return (
                        <tr key={invoice.id}>
                          <td>
                            <Link to={viewPath} className="billing-bill-no">
                              {invoiceDisplayNo(invoice)}
                            </Link>
                          </td>
                          <td>{formatDisplayDate(invoice.invoiceDate)}</td>
                          <td>{billTypeLabel(invoice.billFormat)}</td>
                          <td>{itemCountLabel(invoice.itemCount ?? invoice.items?.length ?? 0)}</td>
                          <td className="num">{formatCurrency(invoice.amountPayable ?? invoice.total)}</td>
                          <td className="num">{formatCurrency(invoice.amountPaid)}</td>
                          <td className={`num${invoice.balanceDue > 0 ? ' due-amount' : ''}`}>
                            {formatCurrency(invoice.balanceDue)}
                          </td>
                          <td>
                            {invoice.amountPaid > 0 ? formatPaymentMode(invoice.paymentMode) : '—'}
                          </td>
                          <td>
                            <StatusBadge kind={invoiceListStatus(invoice)} />
                            {invoice.isHistorical ? (
                              <span className="badge draft billing-old-badge">Old</span>
                            ) : null}
                          </td>
                          <td>
                            <div className="row-actions">
                              <Link
                                to={viewPath}
                                className="btn ghost billing-icon-btn"
                                aria-label={`Open ${invoiceDisplayNo(invoice)}`}
                              >
                                <Eye size={16} strokeWidth={1.75} />
                              </Link>
                              <button
                                type="button"
                                className="btn ghost billing-icon-btn"
                                aria-label={`Print ${invoiceDisplayNo(invoice)}`}
                                onClick={() => setPreviewInvoice(invoice)}
                              >
                                <Printer size={16} strokeWidth={1.75} />
                              </button>
                              {canPay ? (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={() => setPayInvoice(invoice)}
                                >
                                  Record payment
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </DataTable>
            )}
          </section>
        ) : null}

        {tab === 'dues' ? (
          <section className="card padded">
            <PaymentHistorySection payments={summary.payments} />
            <DueHistorySection dues={summary.dues} />
          </section>
        ) : null}

        {tab === 'oldGold' ? (
          <section className="card padded">
            <OldGoldSection summary={summary} onPrint={setPrintOldGoldId} />
          </section>
        ) : null}
      </div>

      <CustomerFormModal
        open={editing}
        editing={customer}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setCustomer(saved)
          setEditing(false)
        }}
      />

      {viewTarget ? (
        <AdaguDueDetailDrawer
          summary={viewTarget}
          payments={adaguPayments(viewTarget)}
          busy={busy}
          onClose={() => setViewTarget(null)}
          onCollectInterest={() => {
            if (viewTarget.interestDue <= 0.005) return
            setInterestTarget(viewTarget)
          }}
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
          key={interestTarget.pledgeId}
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
              <button
                type="button"
                className={isFullRedeem ? 'btn secondary' : 'btn'}
                disabled={busy}
                onClick={() => void collectPartial()}
              >
                {redeemAction === 'partial' ? 'Recording…' : 'Record collection'}
              </button>
              {isFullRedeem ? (
                <button type="button" className="btn" disabled={busy} onClick={() => void redeemFull()}>
                  {redeemAction === 'full' ? 'Closing…' : 'Full redeem'}
                </button>
              ) : null}
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
            {isFullRedeem
              ? `Collect ${formatCurrency(redeemAmount)} and write off ${formatCurrency(redeemDiscount)} to close. Discount applies to full redeem only.`
              : `Collect ${formatCurrency(redeemAmount)}. Discount applies to full redeem only.`}
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

      {collectAccountId ? (
        <CollectPaymentModal
          accountId={collectAccountId}
          onClose={() => setCollectAccountId(null)}
          onCollected={(_paymentId) => {
            const accountId = collectAccountId
            setCollectAccountId(null)
            setPrintAccountId(accountId)
            void reload().catch(() => undefined)
          }}
        />
      ) : null}

      {printAccountId ? (
        <PrintPreviewModal
          title="Scheme passbook"
          path={`/print/gs-passbook/${printAccountId}`}
          pdfFilename="gs-passbook.pdf"
          onClose={() => setPrintAccountId(null)}
        />
      ) : null}

      {previewInvoice ? (
        <InvoicePreviewModal
          invoiceId={previewInvoice.id}
          initialFormat={previewInvoice.billFormat ?? 'cash_bill'}
          pdfFilename={`${previewInvoice.invoiceNo}.pdf`}
          onClose={() => setPreviewInvoice(null)}
        />
      ) : null}

      {payInvoice ? (
        <RecordPaymentModal
          invoice={payInvoice}
          onClose={() => setPayInvoice(null)}
          onRecorded={() => {
            setPayInvoice(null)
            showToast('Payment recorded', 'success')
            void reload().catch(() => undefined)
          }}
        />
      ) : null}

      {printOldGoldId ? (
        <PrintPreviewModal
          title="Old gold purchase"
          path={printPreviewPaths.oldGoldPurchase(printOldGoldId)}
          pdfFilename="old-gold-purchase.pdf"
          onClose={() => setPrintOldGoldId(null)}
        />
      ) : null}
    </div>
  )
}

function oldGoldPreviewStatus(purchase: { status: string; balance: number }): string {
  if (purchase.status === 'cancelled') return 'Cancelled'
  if (purchase.balance > 0) return 'Open'
  return 'Settled'
}

function profileText(value: string | null | undefined): string {
  const text = value?.trim() ?? ''
  return text.length > 0 ? text : '—'
}

function ProfileCard({
  icon,
  tone,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  tone: 'brand' | 'pink' | 'amber'
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className={`customer-profile-card tone-${tone}`}>
      <header className="customer-profile-card-head">
        <span className="customer-profile-card-icon" aria-hidden>
          {icon}
        </span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className="customer-profile-card-body">{children}</div>
    </section>
  )
}

function ProfileEmpty({
  icon,
  tone,
  title,
  text,
}: {
  icon: ReactNode
  tone: 'brand' | 'pink' | 'amber'
  title: string
  text: string
}) {
  return (
    <div className={`customer-profile-empty tone-${tone}`}>
      <span className="customer-profile-empty-icon" aria-hidden>
        {icon}
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

function ProfileFields({ customer }: { customer: Customer }) {
  const rows: { left: [string, string]; right?: [string, string] }[] = [
    { left: ['Name', customer.name], right: ['Mobile', customer.phone] },
    {
      left: ['F / M / H Name', customer.guardianName ?? ''],
      right: ['Aadhaar', customer.aadhaar ?? ''],
    },
    { left: ['PAN', customer.pan ?? ''], right: ['GSTIN', customer.gstin ?? ''] },
    { left: ['ID Proof', customer.idProofType ?? ''], right: ['Address', customer.address ?? ''] },
    { left: ['Notes', customer.notes ?? ''] },
  ]
  return (
    <div className="customer-profile-fields">
      {rows.map((row) => (
        <div key={row.left[0]} className={`customer-profile-row${row.right ? '' : ' single'}`}>
          <span className="customer-profile-label">{row.left[0]}</span>
          <span className={`customer-profile-value${row.right ? '' : ' wide'}`}>
            {profileText(row.left[1])}
          </span>
          {row.right ? (
            <>
              <span className="customer-profile-label">{row.right[0]}</span>
              <span className="customer-profile-value">{profileText(row.right[1])}</span>
            </>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function AdaguRows({
  rows,
  empty,
  onView,
  onBill,
}: {
  rows: AdaguDueSummary[]
  empty: string
  onView: (row: AdaguDueSummary) => void
  onBill: (pledgeId: number) => void
}) {
  if (rows.length === 0) {
    return <p className="muted">{empty}</p>
  }
  return (
    <ul className="dues-detail-history">
      {rows.map((row) => (
        <li key={row.pledgeId}>
          <Link to={`/billing/adagu/${row.pledgeId}`}>{row.receiptNo}</Link>
          <span>{formatDisplayDate(row.pledgeDate)}</span>
          <span className="num">{formatCurrency(row.principal)}</span>
          <span className="num">{formatCurrency(row.monthlyInterest)} / mo</span>
          <span className="num">{formatCurrency(row.interestDue)} interest</span>
          <span>{row.interestPct}%</span>
          <span>Next {formatDisplayDate(row.nextInterestDue)}</span>
          <span className="num">{row.daysActive} days</span>
          <span className={row.remaining > 0 ? 'due-amount' : 'paid-amount'}>
            {formatCurrency(row.remaining)}
          </span>
          {row.isInterestOverdue ? <span className="dues-overdue-badge">Interest overdue</span> : null}
          <span className="row-actions">
            <button type="button" className="btn ghost" onClick={() => onView(row)}>
              View
            </button>
            <button type="button" className="btn ghost" onClick={() => onBill(row.pledgeId)}>
              Bill
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}

function LoanHistoryRows({ loans }: { loans: Pledge[] }) {
  if (loans.length === 0) {
    return <p className="muted">No loans yet.</p>
  }
  return (
    <ul className="dues-detail-history">
      {loans.map((loan) => (
        <li key={loan.id}>
          <Link to={`/billing/adagu/${loan.id}`}>{loan.receiptNo}</Link>
          <span>{formatDisplayDate(loan.pledgeDate)}</span>
          <span className="num">{formatCurrency(loan.loanAmount)}</span>
          <span>{loan.interestPct}% interest</span>
          <span>{loan.repaymentDueDate ? formatDisplayDate(loan.repaymentDueDate) : '—'}</span>
          <span className={loan.status === 'active' ? 'due-amount' : 'paid-amount'}>
            {loanStatusLabel(loan.status)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function SchemeRows({
  accounts,
  empty,
  onCollect,
  onPrintPassbook,
}: {
  accounts: GoldSavingAccount[]
  empty: string
  onCollect: (accountId: number) => void
  onPrintPassbook: (accountId: number) => void
}) {
  if (accounts.length === 0) {
    return <p className="muted">{empty}</p>
  }
  return (
    <ul className="dues-detail-history">
      {accounts.map((account) => (
        <li key={account.id}>
          <Link to={`/gold-savings/accounts/${account.id}`}>{account.accountNo}</Link>
          <span>{account.schemeName}</span>
          <span className="num">{formatCurrency(account.monthlyAmount)} / mo</span>
          <span>
            {account.paidInstallments} / {account.durationMonths} paid
          </span>
          <span className="num">{formatCurrency(account.totalPaid)}</span>
          <span className="num">{formatWeight(account.goldAccumulated, 3)}</span>
          <span>Maturity {formatDisplayDate(account.maturityDate)}</span>
          <span>
            Next {account.nextDueDate ? formatDisplayDate(account.nextDueDate) : '—'}
          </span>
          <GsStatusBadge status={account.status} />
          <span className="row-actions">
            {isCollectableScheme(account) ? (
              <button type="button" className="btn ghost" onClick={() => onCollect(account.id)}>
                <IndianRupee size={16} />
                Collect scheme
              </button>
            ) : null}
            <button type="button" className="btn ghost" onClick={() => onPrintPassbook(account.id)}>
              <Printer size={16} />
              Print passbook
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}

function OldGoldSection({
  summary,
  onPrint,
}: {
  summary: ReturnType<typeof buildCustomerProfile>
  onPrint: (id: number) => void
}) {
  return (
    <div className="drawer-section">
      <h3>Old gold sold</h3>
      {summary.oldGold.length === 0 ? (
        <p className="muted">No old gold purchases yet.</p>
      ) : (
        <>
          <p className="settings-row">
            <strong>Net weight</strong> {formatWeight(summary.oldGoldNetWeight, 3)}
          </p>
          <p className="settings-row">
            <strong>Amount</strong> {formatCurrency(summary.oldGoldAmount)}
          </p>
          <p className="settings-row">
            <strong>Open balance</strong> {formatCurrency(summary.oldGoldOpenBalance)}
          </p>
          <ul className="dues-detail-history">
            {summary.oldGold.map((purchase) => (
              <li key={purchase.id}>
                <span>{purchase.purchaseNo}</span>
                <span>{formatDisplayDate(purchase.date)}</span>
                <span className="num">{formatWeight(purchase.netWeight, 3)}</span>
                <span className="num">{formatCurrency(purchase.amount)}</span>
                <span className={`num ${purchase.balance > 0 ? 'due-amount' : 'paid-amount'}`}>
                  Balance {formatCurrency(purchase.balance)}
                </span>
                <button type="button" className="btn ghost" onClick={() => onPrint(purchase.id)}>
                  <Printer size={16} />
                  Print
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function PaymentHistorySection({
  payments,
}: {
  payments: ReturnType<typeof buildCustomerProfile>['payments']
}) {
  return (
    <div className="drawer-section">
      <h3>Payment History</h3>
      {payments.length === 0 ? (
        <p className="muted">No payments recorded.</p>
      ) : (
        <ul className="dues-detail-history">
          {payments.map((payment) => (
            <li key={payment.id}>
              <span>{formatDisplayDate(payment.date)}</span>
              <span className="num">− {formatCurrency(payment.amount)}</span>
              {payment.invoiceNo ? <span>{payment.invoiceNo}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DueHistorySection({
  dues,
}: {
  dues: ReturnType<typeof buildCustomerProfile>['dues']
}) {
  return (
    <div className="drawer-section">
      <h3>Due History</h3>
      {dues.length === 0 ? (
        <p className="muted">No due history.</p>
      ) : (
        <ul className="dues-detail-history">
          {dues.map((due) => (
            <li key={due.id}>
              <span>{formatDisplayDate(due.date)}</span>
              <span className="num">{formatCurrency(due.amount)}</span>
              {due.invoiceNo ? <span>{due.invoiceNo}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
