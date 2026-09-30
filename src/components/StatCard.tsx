import type { ReactNode } from 'react'

export function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: ReactNode
  tone?: 'brand' | 'success' | 'danger'
}) {
  return (
    <div className="card padded stat-card">
      <span className="stat-card-label">{label}</span>
      <span className={`stat-card-value num${tone ? ` tone-${tone}` : ''}`}>{value}</span>
    </div>
  )
}
