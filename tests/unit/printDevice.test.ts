import { describe, expect, it } from 'vitest'
import { clampCopies, parsePaperSize } from '../../server/lib/printOptions'

describe('parsePaperSize', () => {
  it('accepts a5, a4, and thermal', () => {
    expect(parsePaperSize('a5')).toBe('a5')
    expect(parsePaperSize('A4')).toBe('a4')
    expect(parsePaperSize('thermal')).toBe('thermal')
  })

  it('falls back to A5 for unknown values', () => {
    expect(parsePaperSize('')).toBe('a5')
    expect(parsePaperSize('letter')).toBe('a5')
    expect(parsePaperSize(undefined)).toBe('a5')
  })
})

describe('clampCopies', () => {
  it('defaults invalid values to 1', () => {
    expect(clampCopies(undefined)).toBe(1)
    expect(clampCopies('')).toBe(1)
    expect(clampCopies('nope')).toBe(1)
  })

  it('clamps copies between 1 and 5', () => {
    expect(clampCopies(0)).toBe(1)
    expect(clampCopies(3)).toBe(3)
    expect(clampCopies(9)).toBe(5)
    expect(clampCopies('2')).toBe(2)
  })
})
