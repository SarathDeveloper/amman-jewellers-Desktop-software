/** Number, empty string, or an in-progress draft like `0.` / `0.00`. */
export type NumericField = number | string

/** Optional sign, digits with optional trailing fraction, or a leading-dot fraction. */
const NUMERIC_DRAFT = /^-?(\d+\.?\d*|\.\d*)$/

export function parseNumericField(raw: string): NumericField {
  if (raw === '') {
    return ''
  }
  if (raw === '-' || raw === '.' || raw === '-.') {
    return raw
  }
  if (!NUMERIC_DRAFT.test(raw)) {
    return ''
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return ''
  }
  // Keep trailing dots/zeros so controlled inputs can accept milligram weights.
  if (String(parsed) !== raw) {
    return raw
  }
  return parsed
}

export function numericFieldToNumber(value: NumericField | undefined, fallback = 0): number {
  if (value === '' || value === undefined) {
    return fallback
  }
  if (typeof value === 'number') {
    return value
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
