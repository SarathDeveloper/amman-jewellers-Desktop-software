import { describe, expect, it } from 'vitest'
import { numericFieldToNumber, parseNumericField } from '../../src/lib/numericField'

describe('parseNumericField', () => {
  it('preserves empty input', () => {
    expect(parseNumericField('')).toBe('')
  })

  it('parses numeric strings', () => {
    expect(parseNumericField('4.5')).toBe(4.5)
    expect(parseNumericField('0')).toBe(0)
  })

  it('keeps in-progress decimal drafts', () => {
    expect(parseNumericField('0.')).toBe('0.')
    expect(parseNumericField('0.0')).toBe('0.0')
    expect(parseNumericField('0.00')).toBe('0.00')
    expect(parseNumericField('.')).toBe('.')
    expect(parseNumericField('-')).toBe('-')
  })

  it('accepts milligram stone weights', () => {
    expect(parseNumericField('0.02')).toBe(0.02)
    expect(parseNumericField('0.003')).toBe(0.003)
  })

  it('rejects non-numeric input', () => {
    expect(parseNumericField('abc')).toBe('')
  })
})

describe('numericFieldToNumber', () => {
  it('coerces empty and undefined to fallback', () => {
    expect(numericFieldToNumber('')).toBe(0)
    expect(numericFieldToNumber(undefined)).toBe(0)
    expect(numericFieldToNumber('', 1)).toBe(1)
  })

  it('returns numbers unchanged', () => {
    expect(numericFieldToNumber(88)).toBe(88)
  })

  it('coerces draft strings', () => {
    expect(numericFieldToNumber('0.')).toBe(0)
    expect(numericFieldToNumber('0.00')).toBe(0)
    expect(numericFieldToNumber('0.02')).toBe(0.02)
    expect(numericFieldToNumber('0.003')).toBe(0.003)
  })
})
