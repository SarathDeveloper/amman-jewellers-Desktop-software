import { describe, expect, it } from 'vitest'
import { stripEpochNameSuffix } from '../../shared/customerName'

describe('stripEpochNameSuffix', () => {
  it('removes a trailing 13-digit Date.now suffix', () => {
    expect(stripEpochNameSuffix('Sundari 1790742540382')).toBe('Sundari')
    expect(stripEpochNameSuffix('Buyer OGP 1790742543407')).toBe('Buyer OGP')
    expect(stripEpochNameSuffix('Selvi Adagu 1790742526876')).toBe('Selvi Adagu')
  })

  it('leaves names without a 13-digit suffix unchanged', () => {
    expect(stripEpochNameSuffix('Sundari')).toBe('Sundari')
    expect(stripEpochNameSuffix('Sundari 123')).toBe('Sundari 123')
    expect(stripEpochNameSuffix('Sundari 17907425403821')).toBe('Sundari 17907425403821')
    expect(stripEpochNameSuffix('Ravi Kumar')).toBe('Ravi Kumar')
  })
})
