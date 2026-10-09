import { describe, expect, it } from 'vitest'
import { huidRemovalRange, isHuidMandatory, newPieceHuidError } from '../../shared/itemTypes'

describe('HUID rules by metal', () => {
  it('makes HUIDs mandatory for gold only', () => {
    expect(isHuidMandatory('Gold')).toBe(true)
    expect(isHuidMandatory('Silver')).toBe(false)
  })

  it('needs one HUID per new gold piece', () => {
    expect(newPieceHuidError('Gold', 2, 2)).toBeNull()
    expect(newPieceHuidError('Gold', 1, 2)).toBe('Add 2 HUIDs for the new pieces')
    expect(newPieceHuidError('Gold', 0, 1)).toBe('Add 1 HUID for the new piece')
  })

  it('accepts any number of silver HUIDs up to the piece count', () => {
    expect(newPieceHuidError('Silver', 0, 3)).toBeNull()
    expect(newPieceHuidError('Silver', 2, 3)).toBeNull()
    expect(newPieceHuidError('Silver', 4, 3)).toBe('Only 3 HUIDs can be added for 3 pieces')
  })

  it('removes exactly the sold gold tags', () => {
    expect(huidRemovalRange('Gold', 5, 5, 2)).toEqual({ min: 2, max: 2 })
    expect(huidRemovalRange('Gold', 1, 5, 2)).toEqual({ min: 1, max: 1 })
  })

  it('only forces silver tag removal when tags would outnumber the remaining pieces', () => {
    expect(huidRemovalRange('Silver', 1, 5, 2)).toEqual({ min: 0, max: 1 })
    expect(huidRemovalRange('Silver', 4, 5, 2)).toEqual({ min: 1, max: 2 })
    expect(huidRemovalRange('Silver', 2, 2, 1)).toEqual({ min: 1, max: 1 })
  })
})
