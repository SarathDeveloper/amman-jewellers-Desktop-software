import type { GoldSavingAccountStatus, GoldSavingInstallmentStatus, GoldSavingPaymentStatus } from '@shared/types'

export function GsStatusBadge({
  status,
}: {
  status: GoldSavingAccountStatus | GoldSavingInstallmentStatus | GoldSavingPaymentStatus | string
}) {
  const tone =
    status === 'paid' || status === 'active' || status === 'posted' || status === 'redeemed' || status === 'final'
      ? 'paid'
      : status === 'overdue' || status === 'cancelled' || status === 'reversed'
        ? 'due'
        : status === 'matured' || status === 'due'
          ? 'draft'
          : 'estimate'
  return <span className={`badge ${tone}`}>{labelStatus(status)}</span>
}

function labelStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}
