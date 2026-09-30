import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'

export function PledgePreviewModal({
  pledgeId,
  onClose,
}: {
  pledgeId: number
  onClose: () => void
}) {
  return (
    <PrintPreviewModal
      title="Print preview"
      path={printPreviewPaths.pledge(pledgeId)}
      onClose={onClose}
    />
  )
}
