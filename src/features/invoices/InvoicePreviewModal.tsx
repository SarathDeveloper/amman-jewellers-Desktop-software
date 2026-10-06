import type { BillFormat } from '@shared/types'
import { api } from '../../lib/api'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { billPrintPath } from './billingPrint'

export function InvoicePreviewModal({
  invoiceId,
  initialFormat,
  pdfFilename = 'invoice.pdf',
  onClose,
}: {
  invoiceId: number
  initialFormat: BillFormat
  pdfFilename?: string
  onClose: () => void
}) {
  return (
    <PrintPreviewModal
      title="Print preview"
      path={billPrintPath(invoiceId, initialFormat)}
      pdfFilename={pdfFilename}
      onClose={onClose}
      onPrint={() => {
        void api.markInvoicePrinted(invoiceId).catch(() => undefined)
      }}
    />
  )
}
