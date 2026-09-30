import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="card padded empty-state empty-state-block">
      <p className="empty-state-title">{title}</p>
      <p>{description}</p>
      {action}
    </div>
  )
}
