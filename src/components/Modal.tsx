import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode | null
  className?: string
  hideTitle?: boolean
}

export function Modal({ title, children, onClose, footer, className, hideTitle }: ModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal${className ? ` ${className}` : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {hideTitle ? null : <h2>{title}</h2>}
        {children}
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
    </div>
  )
}
