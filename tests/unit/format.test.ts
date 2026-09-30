import { describe, expect, it } from 'vitest'
import { formatDisplayClock, formatDisplayDate } from '../../src/lib/format'

describe('formatDisplayDate', () => {
  it('formats ISO dates as day month year', () => {
    expect(formatDisplayDate('2026-09-22')).toBe('22 Sep 2026')
    expect(formatDisplayDate('2026-01-02')).toBe('2 Jan 2026')
  })
})

describe('formatDisplayClock', () => {
  it('formats HH:mm as 12-hour time', () => {
    expect(formatDisplayClock('21:00')).toBe('9:00 PM')
    expect(formatDisplayClock('09:05')).toBe('9:05 AM')
    expect(formatDisplayClock('00:00')).toBe('12:00 AM')
    expect(formatDisplayClock('12:00')).toBe('12:00 PM')
  })
})
