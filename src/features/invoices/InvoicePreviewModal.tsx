import type { BillFormat } from '@shared/types'
import { api } from '../../lib/api'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { billPrintPath } from './billingPrint'

export function InvoicePreviewModal({
  invoiceId,
  initialFormat,
  onClose,
}: {
  invoiceId: number
  initialFormat: BillFormat
  onClose: () => void
}) {
  return (
    <PrintPreviewModal
      title="Print preview"
      path={billPrintPath(invoiceId, initialFormat)}
      onClose={onClose}
      onPrint={() => {
        void api.markInvoicePrinted(invoiceId).catch(() => undefined)
      }}
    />
  )
}
