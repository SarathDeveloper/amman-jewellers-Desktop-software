import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'

export function PledgePreviewModal({
  pledgeId,
  pdfFilename = 'pledge.pdf',
  onClose,
}: {
  pledgeId: number
  pdfFilename?: string
  onClose: () => void
}) {
  return (
    <PrintPreviewModal
      title="Print preview"
      path={printPreviewPaths.pledge(pledgeId)}
      pdfFilename={pdfFilename}
      onClose={onClose}
    />
  )
}
