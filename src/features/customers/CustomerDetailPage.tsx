import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import type { Customer, DuesLedger, Invoice, OldGoldPurchase } from '@shared/types'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/PageHeader'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../lib/format'
import { api } from '../../lib/api'
import { CustomerFormModal } from './CustomerFormModal'
import { CustomerRecordPanel } from './CustomerRecordPanel'
import { buildCustomerProfile } from './customerProfile'

export function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const customerId = Number(id)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [oldGold, setOldGold] = useState<OldGoldPurchase[]>([])
  const [ledger, setLedger] = useState<DuesLedger>({ columns: [], totalOutstanding: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!Number.isInteger(customerId) || customerId <= 0) {
      setError('Customer not found')
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    void Promise.all([
      api.getCustomer(customerId),
      api.listInvoices({ customerId, page: 1, pageSize: 50, status: 'final' }),
      api.listOldGoldPurchases({ customerId }),
      api.listDues(),
    ])
      .then(([record, invoicePage, purchases, dues]) => {
        if (!active) return
        setCustomer(record)
        setInvoices(invoicePage.items ?? [])
        setOldGold(purchases)
        setLedger(dues)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load customer')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [customerId])

  if (loading) {
    return (
      <div className="app-page">
        <LoadingState />
      </div>
    )
  }

  if (!customer) {
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

  const summary = buildCustomerProfile(
    customer.id,
    invoices,
    ledger.columns.find((column) => column.customerId === customer.id),
    oldGold,
  )

  return (
    <div className="app-page">
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

      <div className="customer-page-stack">
        <section className="card padded">
          <CustomerRecordPanel
            customer={customer}
            profileTitle="Customer Profile"
            linkLoans
          />
        </section>

        <section className="card padded">
          <div className="drawer-section">
            <h3>Financial Summary</h3>
            <p className="settings-row"><strong>Total Purchases</strong> {formatCurrency(summary.totalPurchases)}</p>
            <p className="settings-row"><strong>Total Paid</strong> {formatCurrency(summary.totalPaid)}</p>
            <p className="settings-row"><strong>Outstanding</strong> {formatCurrency(summary.outstanding)}</p>
          </div>
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
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="drawer-section">
            <h3>Purchase History</h3>
            {summary.purchases.length === 0 ? (
              <p className="muted">No purchases yet.</p>
            ) : (
              <ul className="dues-detail-history">
                {summary.purchases.map((invoice) => (
                  <li key={invoice.invoiceId}>
                    <span>{invoice.invoiceNo}</span>
                    <span>{formatDisplayDate(invoice.date)}</span>
                    <span className="num">{formatCurrency(invoice.total)}</span>
                    <span className="num paid-amount">Paid {formatCurrency(invoice.amountPaid)}</span>
                    <span className={`num ${invoice.balanceDue > 0 ? 'due-amount' : 'paid-amount'}`}>
                      Due {formatCurrency(invoice.balanceDue)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="drawer-section">
            <h3>Payment History</h3>
            {summary.payments.length === 0 ? (
              <p className="muted">No payments recorded.</p>
            ) : (
              <ul className="dues-detail-history">
                {summary.payments.map((payment) => (
                  <li key={payment.id}>
                    <span>{formatDisplayDate(payment.date)}</span>
                    <span className="num">− {formatCurrency(payment.amount)}</span>
                    {payment.invoiceNo ? <span>{payment.invoiceNo}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="drawer-section">
            <h3>Due History</h3>
            {summary.dues.length === 0 ? (
              <p className="muted">No due history.</p>
            ) : (
              <ul className="dues-detail-history">
                {summary.dues.map((due) => (
                  <li key={due.id}>
                    <span>{formatDisplayDate(due.date)}</span>
                    <span className="num">{formatCurrency(due.amount)}</span>
                    {due.invoiceNo ? <span>{due.invoiceNo}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
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
    </div>
  )
}
