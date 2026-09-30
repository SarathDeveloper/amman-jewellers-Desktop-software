import type { ReactNode } from 'react'

export function Drawer({
  title,
  children,
  onClose,
  wide,
  hideTitle,
  size,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  hideTitle?: boolean
  size?: 'default' | 'wide' | 'page'
}) {
  const sizeClass =
    size === 'page' ? ' drawer--page' : size === 'wide' || wide ? ' drawer--wide' : ''
  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className={`drawer${sizeClass}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {hideTitle ? null : <h2>{title}</h2>}
        {children}
      </aside>
    </div>
  )
}
