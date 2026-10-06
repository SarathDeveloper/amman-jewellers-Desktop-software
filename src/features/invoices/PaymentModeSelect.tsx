import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import type { PaymentMode } from '@shared/types'
import { formatPaymentMode } from '../../lib/format'

export const BILL_PAYMENT_MODES: PaymentMode[] = ['cash', 'upi', 'card', 'mixed']
export const SINGLE_PAYMENT_MODES: Array<Extract<PaymentMode, 'cash' | 'upi' | 'card'>> = [
  'cash',
  'upi',
  'card',
]

export function PaymentModeSelect<T extends PaymentMode>({
  value,
  onChange,
  modes = BILL_PAYMENT_MODES as T[],
  disabled,
  label = 'Payment Mode',
}: {
  value: T
  onChange: (mode: T) => void
  modes?: readonly T[]
  disabled?: boolean
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const listId = useId()

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const estimatedHeight = modes.length * 36 + 16
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight
    setMenuStyle({
      top: openUp ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [open, modes.length])

  useEffect(() => {
    if (!open) return

    function onDocClick(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  function pick(mode: T) {
    onChange(mode)
    setOpen(false)
  }

  return (
    <div className="payment-mode-select adagu-field" ref={rootRef}>
      <label id={labelId}>{label}</label>
      <div className="payment-mode-select-control">
        <button
          ref={triggerRef}
          type="button"
          className={`payment-mode-select-trigger${open ? ' is-open' : ''}`}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{formatPaymentMode(value)}</span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
        {open
          ? createPortal(
              <div
                ref={menuRef}
                className="payment-mode-select-menu"
                role="listbox"
                id={listId}
                aria-labelledby={labelId}
                style={menuStyle}
              >
                {modes.map((mode) => {
                  const selected = mode === value
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`payment-mode-select-option${selected ? ' is-selected' : ''}`}
                      onClick={() => pick(mode)}
                    >
                      <span className="payment-mode-select-check" aria-hidden>
                        {selected ? <Check size={14} strokeWidth={2.5} /> : null}
                      </span>
                      <span>{formatPaymentMode(mode)}</span>
                    </button>
                  )
                })}
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  )
}
