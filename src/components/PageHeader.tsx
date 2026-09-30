import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header app-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="page-subtitle muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="toolbar page-header-actions">{actions}</div> : null}
    </header>
  )
}
