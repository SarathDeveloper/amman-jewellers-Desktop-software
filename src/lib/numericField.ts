export type NumericField = number | ''

export function parseNumericField(raw: string): NumericField {
  if (raw === '') {
    return ''
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : ''
}

export function numericFieldToNumber(value: NumericField | undefined, fallback = 0): number {
  if (value === '' || value === undefined) {
    return fallback
  }
  return value
}
