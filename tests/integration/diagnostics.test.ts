import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { categoryLogFile } from '../../server/lib/logger'
import { invokeIpcForTests } from './helpers/testEnv'
import { IPC_CHANNELS, useIntegrationEnv } from './helpers/testEnv'

describe('error diagnostics', () => {
  useIntegrationEnv()

  it('does not assign a reference ID to an expected validation error', async () => {
    const result = await invokeIpcForTests(IPC_CHANNELS.PRODUCTS_CREATE, { name: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0)
      expect(result.referenceId).toBeUndefined()
    }
    expect(existsSync(categoryLogFile('application'))).toBe(false)
    expect(existsSync(categoryLogFile('crash'))).toBe(false)
  })
})
