import { Check, Eye, FileDown, MessageCircle, Plus, Printer } from 'lucide-react'
import { paymentStatusFor, resolveAmountPayable } from '@shared/billing/billSummary'
import type { Invoice } from '@shared/types'
import { Modal } from '../../components/Modal'
import { formatCurrency } from '../../lib/format'

function whatsappHref(invoice: Invoice): string {
  const payable = resolveAmountPayable(invoice.amountPayable, invoice.total)
  const status = paymentStatusFor(payable, invoice.amountPaid, invoice.total).toUpperCase()
  const text = [
    `Bill ${invoice.invoiceNo}`,
    `Customer: ${invoice.customerName}`,
    `Amount payable: ${formatCurrency(payable)}`,
    `Paid: ${formatCurrency(invoice.amountPaid)}`,
    `Balance: ${formatCurrency(invoice.balanceDue)}`,
    `Status: ${status}`,
  ].join('\n')
  const phone = invoice.customerPhone.replace(/\D/g, '')
  const withCountry = phone.length === 10 ? `91${phone}` : phone
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`
}

export function InvoiceSuccessModal({
  invoice,
  onPrint,
  onPdf,
  onView,
  onNewBill,
  onClose,
}: {
  invoice: Invoice
  onPrint: () => void
  onPdf: () => void
  onView: () => void
  onNewBill: () => void
  onClose: () => void
}) {
  const payable = resolveAmountPayable(invoice.amountPayable, invoice.total)
  const status = paymentStatusFor(payable, invoice.amountPaid, invoice.total)
  const statusLabel = status === 'paid' ? 'PAID' : status === 'partial' ? 'PARTIAL' : 'UNPAID'

  return (
    <Modal title="Bill finalized" className="invoice-success-modal" onClose={onClose} footer={null}>
      <div className="invoice-success-body">
        <div className="invoice-success-icon" aria-hidden>
          <Check size={22} strokeWidth={2.25} />
        </div>
        <h3>{invoice.invoiceNo}</h3>
        <p className="invoice-success-customer">{invoice.customerName}</p>
        <div className="invoice-success-grid">
          <div>
            <span>Amount payable</span>
            <strong>{formatCurrency(payable)}</strong>
          </div>
          <div>
            <span>Paid</span>
            <strong>{formatCurrency(invoice.amountPaid)}</strong>
          </div>
          <div>
            <span>Balance</span>
            <strong>{formatCurrency(invoice.balanceDue)}</strong>
          </div>
        </div>
        <span className={`bill-status-chip bill-status-chip--${status}`}>{statusLabel}</span>
      </div>
      <div className="modal-actions invoice-success-actions">
        <button type="button" className="btn" onClick={onPrint}>
          <Printer size={16} /> Print
        </button>
        <a className="btn secondary" href={whatsappHref(invoice)} target="_blank" rel="noreferrer">
          <MessageCircle size={16} /> WhatsApp
        </a>
        <button type="button" className="btn secondary" onClick={onPdf}>
          <FileDown size={16} /> Download PDF
        </button>
        <button type="button" className="btn secondary" onClick={onView}>
          <Eye size={16} /> View Invoice
        </button>
        <button type="button" className="btn secondary" onClick={onNewBill}>
          <Plus size={16} /> New Bill
        </button>
      </div>
    </Modal>
  )
}
