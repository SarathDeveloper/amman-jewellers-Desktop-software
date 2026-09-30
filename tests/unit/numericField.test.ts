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
})
