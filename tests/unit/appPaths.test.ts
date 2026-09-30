import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAppRoot, getMigrationsDir } from '../../server/lib/appPaths'

describe('app paths', () => {
  it('finds the repo root from package.json', () => {
    const root = getAppRoot()
    expect(existsSync(join(root, 'package.json'))).toBe(true)
  })

  it('finds packaged SQL migrations', () => {
    const dir = getMigrationsDir()
    expect(existsSync(join(dir, '001_initial.sql'))).toBe(true)
    expect(existsSync(join(dir, '038_purchase_invoice.sql'))).toBe(true)
  })
})
