export type StatusKind = 'draft' | 'estimate' | 'final' | 'due' | 'paid' | 'overdue'

const labels: Record<StatusKind, string> = {
  draft: 'Draft',
  estimate: 'Estimate',
  final: 'Final',
  due: 'Due',
  paid: 'Paid',
  overdue: 'Overdue',
}

export function StatusBadge({ kind, label }: { kind: StatusKind; label?: string }) {
  const className =
    kind === 'overdue' ? 'badge due' : kind === 'estimate' ? 'badge estimate' : `badge ${kind}`
  return <span className={className}>{label ?? labels[kind]}</span>
}
