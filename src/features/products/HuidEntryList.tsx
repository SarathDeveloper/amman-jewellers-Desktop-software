import { ShieldCheck, Trash2 } from 'lucide-react'

export function resizeHuidRows(current: string[], qty: number, keepFilledExtras = false): string[] {
  const n = Math.max(0, Math.trunc(qty))
  const filledCount = current.filter((value) => value.trim()).length
  if (keepFilledExtras && filledCount > n) {
    return current
  }
  const next = current.slice(0, Math.max(n, keepFilledExtras ? current.length : n))
  while (next.length < n) next.push('')
  if (!keepFilledExtras && next.length > n) {
    return next.slice(0, n)
  }
  if (keepFilledExtras && next.length > n) {
    while (next.length > n && !next[next.length - 1]?.trim()) {
      next.pop()
    }
  }
  return next
}

export function HuidEntryList({
  values,
  onChange,
  error,
  disabled,
  allowRemove,
  labelledBy,
}: {
  values: string[]
  onChange: (values: string[]) => void
  error?: string
  disabled?: boolean
  allowRemove?: boolean
  labelledBy?: string
}) {
  function update(index: number, value: string) {
    const next = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6)
    onChange(values.map((huid, rowIndex) => (rowIndex === index ? next : huid)))
  }

  function remove(index: number) {
    onChange(values.filter((_, rowIndex) => rowIndex !== index))
  }

  if (values.length === 0) {
    return <p className="muted">No HUID rows for this quantity.</p>
  }

  return (
    <div className="product-attr-editor">
      {values.map((huid, index) => (
        <div key={index} className="product-huid-row">
          <div className={`product-form-control${disabled ? '' : ' has-icon'}`}>
            {disabled ? null : (
              <span className="product-form-lead-icon" aria-hidden>
                <ShieldCheck size={14} strokeWidth={1.75} />
              </span>
            )}
            <input
              className={`input${error ? ' is-invalid' : ''}`}
              value={huid}
              maxLength={6}
              disabled={disabled}
              placeholder="e.g. A1B2C3"
              aria-label={`HUID ${index + 1}`}
              {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
              onChange={(event) => update(index, event.target.value)}
            />
          </div>
          {allowRemove && !disabled ? (
            <button
              type="button"
              className="btn ghost icon-btn"
              aria-label={`Remove HUID ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      ))}
      {error ? <span className="product-form-error">{error}</span> : null}
    </div>
  )
}
