import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const OVERLAY_SELECTOR = '.modal-backdrop, .drawer-backdrop'

function isTopOverlay(element: HTMLElement | null) {
  if (!element) return false
  const overlays = document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)
  return overlays.length > 0 && overlays[overlays.length - 1] === element
}

export function Drawer({
  title,
  children,
  onClose,
  wide,
  hideTitle,
  size,
  busy,
  dismissible = true,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  hideTitle?: boolean
  size?: 'default' | 'wide' | 'page'
  /** While true the drawer cannot be dismissed from the backdrop or Escape. */
  busy?: boolean
  dismissible?: boolean
}) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const canClose = dismissible && !busy
  const sizeClass =
    size === 'page' ? ' drawer--page' : size === 'wide' || wide ? ' drawer--wide' : ''

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (!canClose) return
      if (!isTopOverlay(backdropRef.current)) return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [canClose, onClose])

  return createPortal(
    <div
      ref={backdropRef}
      className="drawer-backdrop"
      onClick={canClose ? onClose : undefined}
      role="presentation"
    >
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
    </div>,
    document.body,
  )
}
