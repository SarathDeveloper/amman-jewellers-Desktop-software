export type StatusKind = 'draft' | 'estimate' | 'final' | 'due' | 'paid' | 'overdue' | 'cancelled'

const labels: Record<StatusKind, string> = {
  draft: 'Draft',
  estimate: 'Estimate',
  final: 'Final',
  due: 'Due',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

export function StatusBadge({ kind, label }: { kind: StatusKind; label?: string }) {
  const className =
    kind === 'overdue'
      ? 'badge due'
      : kind === 'estimate'
        ? 'badge estimate'
        : kind === 'cancelled'
          ? 'badge cancelled'
          : `badge ${kind}`
  return <span className={className}>{label ?? labels[kind]}</span>
}
