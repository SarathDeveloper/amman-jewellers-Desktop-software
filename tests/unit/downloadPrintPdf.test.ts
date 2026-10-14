import { describe, expect, it } from 'vitest'
import { pageBreakPaddingPx } from '../../src/features/print/downloadPrintPdf'

describe('pageBreakPaddingPx', () => {
  it('returns 0 when the block already starts on a page boundary', () => {
    expect(pageBreakPaddingPx(0, 1123)).toBe(0)
    expect(pageBreakPaddingPx(1123, 1123)).toBe(0)
    expect(pageBreakPaddingPx(2246, 1123)).toBe(0)
  })

  it('pads the remainder so the next block starts on the following page', () => {
    expect(pageBreakPaddingPx(400, 1123)).toBe(723)
    expect(pageBreakPaddingPx(1200, 1123)).toBe(1046)
  })

  it('ignores invalid page heights', () => {
    expect(pageBreakPaddingPx(400, 0)).toBe(0)
  })
})
