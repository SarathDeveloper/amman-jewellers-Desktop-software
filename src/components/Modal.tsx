import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode | null
  className?: string
  hideTitle?: boolean
  /** While true the dialog cannot be dismissed from the backdrop or Escape. */
  busy?: boolean
  /** Set false to require an explicit action (e.g. a button) before closing. */
  dismissible?: boolean
  /**
   * Opt out of the scrollable body wrapper. Used by dialogs that lay out their own
   * header/body/footer inside the modal (print preview, product/inward editors).
   */
  noBodyWrapper?: boolean
}

const OVERLAY_SELECTOR = '.modal-backdrop, .drawer-backdrop'

function isTopOverlay(element: HTMLElement | null) {
  if (!element) return false
  const overlays = document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)
  return overlays.length > 0 && overlays[overlays.length - 1] === element
}

export function Modal({
  title,
  children,
  onClose,
  footer,
  className,
  hideTitle,
  busy,
  dismissible = true,
  noBodyWrapper,
}: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const canClose = dismissible && !busy

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (!canClose) return
      // Only the top-most overlay reacts, so a confirm dialog opened from a modal
      // (or the drawer under it) does not close both at once.
      if (!isTopOverlay(backdropRef.current)) return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [canClose, onClose])

  const wrapBody = !noBodyWrapper && footer !== null

  return createPortal(
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onClick={canClose ? onClose : undefined}
      role="presentation"
    >
      <div
        className={`modal${className ? ` ${className}` : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {hideTitle ? null : <h2>{title}</h2>}
        {wrapBody ? <div className="modal-body">{children}</div> : children}
        {footer !== undefined ? (
          footer
        ) : (
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
