import { describe, expect, it } from 'vitest'
import { huidRemovalRange, newPieceHuidError } from '../../shared/itemTypes'

describe('HUID rules', () => {
  it('accepts up to one HUID per new piece for any metal', () => {
    expect(newPieceHuidError(2, 2)).toBeNull()
    expect(newPieceHuidError(0, 1)).toBeNull()
    expect(newPieceHuidError(1, 3)).toBeNull()
  })

  it('rejects more HUIDs than pieces', () => {
    expect(newPieceHuidError(2, 1)).toBe('Only 1 HUID can be added for 1 piece')
    expect(newPieceHuidError(4, 3)).toBe('Only 3 HUIDs can be added for 3 pieces')
  })

  it('only forces tag removal when tags would outnumber the remaining pieces', () => {
    expect(huidRemovalRange(5, 5, 2)).toEqual({ min: 2, max: 2 })
    expect(huidRemovalRange(1, 5, 2)).toEqual({ min: 0, max: 1 })
    expect(huidRemovalRange(4, 5, 2)).toEqual({ min: 1, max: 2 })
    expect(huidRemovalRange(2, 2, 1)).toEqual({ min: 1, max: 1 })
  })
})
