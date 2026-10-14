import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { localDateIso, localTodayIso } from '@shared/localDate'
import { formatDisplayClock, formatDisplayDate, formatDisplayMonth } from '../lib/format'

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

function monthKey(iso: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})/.exec(iso.trim()) ?? /^(\d{4})-(\d{2})/.exec(localTodayIso())
  return { year: Number(match?.[1] ?? 0), month: Number(match?.[2] ?? 1) - 1 }
}

function inRange(iso: string, min?: string, max?: string): boolean {
  const day = iso.slice(0, 10)
  if (min && day < min.slice(0, 10)) return false
  if (max && day > max.slice(0, 10)) return false
  return true
}

function monthCells(year: number, monthIndex: number): Array<{ iso: string; day: number; outside: boolean }> {
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const start = new Date(year, monthIndex, 1 - firstWeekday)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return {
      iso: localDateIso(date),
      day: date.getDate(),
      outside: date.getMonth() !== monthIndex,
    }
  })
}

function placePopover(anchor: DOMRect, width: number, height: number): CSSProperties {
  const margin = 8
  const gap = 6
  const maxLeft = window.innerWidth - width - margin
  const left = Math.min(Math.max(margin, anchor.left), Math.max(margin, maxLeft))
  const spaceBelow = window.innerHeight - anchor.bottom - margin
  const spaceAbove = anchor.top - margin
  const openUp = spaceBelow < height + gap && spaceAbove > spaceBelow
  const preferred = openUp ? anchor.top - height - gap : anchor.bottom + gap
  const top = Math.min(Math.max(margin, preferred), Math.max(margin, window.innerHeight - height - margin))
  return { top, left }
}

export function DateInput({
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
  min,
  max,
  showIcon,
}: {
  value: string
  onChange: (isoDate: string) => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
  min?: string
  max?: string
  showIcon?: boolean
}) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => monthKey(value || localTodayIso()))
  const [popStyle, setPopStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const today = localTodayIso()
  const days = monthCells(view.year, view.month)
  const monthLabel = formatDisplayMonth(`${view.year}-${String(view.month + 1).padStart(2, '0')}`)

  function openCalendar() {
    if (disabled) return
    setView(monthKey(value || today))
    setOpen(true)
  }

  function closeCalendar() {
    setOpen(false)
  }

  function pick(iso: string) {
    onChange(iso)
    closeCalendar()
  }

  function shiftMonth(delta: number) {
    setView((current) => {
      const next = new Date(current.year, current.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const anchor = rootRef.current?.getBoundingClientRect()
      const pop = popRef.current
      if (!anchor || !pop) return
      setPopStyle({ ...placePopover(anchor, pop.offsetWidth, pop.offsetHeight), visibility: 'visible' })
    }
    place()
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }, [open, view, value])

  useEffect(() => {
    if (!open) return

    function onDocMouseDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || popRef.current?.contains(target)) return
      closeCalendar()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      closeCalendar()
    }

    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  function onFieldMouseDown(event: ReactMouseEvent<HTMLInputElement>) {
    // Chromium opens its own picker from this event, and that popup scales
    // with the field font, so compact inputs render a shrunken calendar.
    event.preventDefault()
    if (!disabled) event.currentTarget.focus()
  }

  return (
    <span
      ref={rootRef}
      className={`date-display-input${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
    >
      {showIcon ? <Calendar size={14} strokeWidth={1.75} className="date-display-input-icon" aria-hidden /> : null}
      <span className="date-display-input-value">{value ? formatDisplayDate(value) : '—'}</span>
      <input
        type="date"
        className="date-display-input-native"
        value={value}
        disabled={disabled}
        min={min}
        max={max}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={onFieldMouseDown}
        onClick={(event) => {
          event.preventDefault()
          if (open) closeCalendar()
          else openCalendar()
        }}
        onKeyDown={(event) => {
          if (disabled) return
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            event.preventDefault()
            openCalendar()
          }
        }}
        onChange={(event) => onChange(event.target.value)}
      />
      {open
        ? createPortal(
            <div
              ref={popRef}
              className="date-calendar"
              role="dialog"
              aria-label="Choose a date"
              style={popStyle}
            >
              <div className="date-calendar-header">
                <button type="button" className="date-calendar-nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                  <ChevronLeft size={16} strokeWidth={2} />
                </button>
                <span className="date-calendar-title">{monthLabel}</span>
                <button type="button" className="date-calendar-nav" aria-label="Next month" onClick={() => shiftMonth(1)}>
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
              </div>
              <div className="date-calendar-grid">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label} className="date-calendar-dow">
                    {label}
                  </span>
                ))}
                {days.map((cell) => {
                  const selected = value.slice(0, 10) === cell.iso
                  const isToday = cell.iso === today
                  const allowed = inRange(cell.iso, min, max)
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      className={`date-calendar-day${cell.outside ? ' is-outside' : ''}${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                      disabled={!allowed}
                      aria-label={formatDisplayDate(cell.iso)}
                      aria-pressed={selected}
                      onClick={() => pick(cell.iso)}
                    >
                      {cell.day}
                    </button>
                  )
                })}
              </div>
              <div className="date-calendar-footer">
                <button type="button" disabled={!inRange(today, min, max)} onClick={() => pick(today)}>
                  Today
                </button>
                {value ? (
                  <button type="button" className="is-muted" onClick={() => pick('')}>
                    Clear
                  </button>
                ) : (
                  <span />
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}

export function TimeInput({
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  value: string
  onChange: (hhmm: string) => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  return (
    <span className={`date-display-input is-time${className ? ` ${className}` : ''}`}>
      <span className="date-display-input-value">{value ? formatDisplayClock(value) : '—'}</span>
      <input
        type="time"
        step={60}
        className="date-display-input-native"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value.slice(0, 5))}
      />
    </span>
  )
}
