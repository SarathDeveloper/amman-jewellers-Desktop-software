import { describe, expect, it } from 'vitest'
import { safeReturnPath } from '../../src/features/auth/returnPath'

describe('safeReturnPath', () => {
  it('keeps an in-app path, including a query', () => {
    expect(safeReturnPath('/billing/cash/new')).toBe('/billing/cash/new')
    expect(safeReturnPath('/customers?q=rani')).toBe('/customers?q=rani')
  })

  it('drops login, external, and empty values', () => {
    expect(safeReturnPath('/login')).toBeNull()
    expect(safeReturnPath('/login?next=/billing')).toBeNull()
    expect(safeReturnPath('//evil.example')).toBeNull()
    expect(safeReturnPath('https://evil.example')).toBeNull()
    expect(safeReturnPath(undefined)).toBeNull()
  })
})
