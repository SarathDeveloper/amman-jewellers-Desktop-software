import { formatDisplayDate, formatDisplayClock } from '../lib/format'

export function DateInput({
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
  min,
  max,
}: {
  value: string
  onChange: (isoDate: string) => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
  min?: string
  max?: string
}) {
  return (
    <span className={`date-display-input${className ? ` ${className}` : ''}`}>
      <span className="date-display-input-value">{value ? formatDisplayDate(value) : '—'}</span>
      <input
        type="date"
        className="date-display-input-native"
        value={value}
        disabled={disabled}
        min={min}
        max={max}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      />
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
    <span className={`date-display-input${className ? ` ${className}` : ''}`}>
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
