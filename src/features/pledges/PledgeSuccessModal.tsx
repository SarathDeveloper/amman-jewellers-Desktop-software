import { Check, Eye, FileDown, MessageCircle, Plus, Printer } from 'lucide-react'
import { netPaidAmount } from '@shared/billing/pledgeMath'
import type { Pledge } from '@shared/types'
import { Modal } from '../../components/Modal'
import { formatCurrency } from '../../lib/format'
import { whatsappLink } from '../../lib/whatsapp'

function whatsappHref(pledge: Pledge): string {
  const netPaid = netPaidAmount(pledge.loanAmount, pledge.charges ?? 0)
  const text = [
    `Adagu bill ${pledge.receiptNo}`,
    `Customer: ${pledge.customerName}`,
    `Loan amount: ${formatCurrency(pledge.loanAmount)}`,
    `Net paid: ${formatCurrency(netPaid)}`,
    `Status: ACTIVE`,
  ].join('\n')
  return whatsappLink(pledge.customerPhone, text)
}

export function PledgeSuccessModal({
  pledge,
  onPrint,
  onPdf,
  onView,
  onNewBill,
  onClose,
}: {
  pledge: Pledge
  onPrint: () => void
  onPdf: () => void
  onView: () => void
  onNewBill: () => void
  onClose: () => void
}) {
  const netPaid = netPaidAmount(pledge.loanAmount, pledge.charges ?? 0)

  return (
    <Modal title="Loan sanctioned" className="invoice-success-modal" onClose={onClose} footer={null}>
      <div className="invoice-success-body">
        <div className="invoice-success-icon" aria-hidden>
          <Check size={22} strokeWidth={2.25} />
        </div>
        <h3>{pledge.receiptNo}</h3>
        <p className="invoice-success-customer">{pledge.customerName}</p>
        <div className="invoice-success-grid">
          <div>
            <span>Loan amount</span>
            <strong>{formatCurrency(pledge.loanAmount)}</strong>
          </div>
          <div>
            <span>Net paid</span>
            <strong>{formatCurrency(netPaid)}</strong>
          </div>
          <div>
            <span>Charges</span>
            <strong>{formatCurrency(pledge.charges ?? 0)}</strong>
          </div>
        </div>
        <span className="bill-status-chip bill-status-chip--paid">ACTIVE</span>
      </div>
      <div className="modal-actions invoice-success-actions">
        <button type="button" className="btn" onClick={onNewBill}>
          <Plus size={16} /> New Bill
        </button>
        <button type="button" className="btn secondary" onClick={onView}>
          <Eye size={16} /> View Bill
        </button>
        <button type="button" className="btn secondary" onClick={onPrint}>
          <Printer size={16} /> Print
        </button>
        <a className="btn secondary" href={whatsappHref(pledge)} target="_blank" rel="noreferrer">
          <MessageCircle size={16} /> WhatsApp
        </a>
        <button type="button" className="btn secondary" onClick={onPdf}>
          <FileDown size={16} /> Download PDF
        </button>
      </div>
    </Modal>
  )
}
