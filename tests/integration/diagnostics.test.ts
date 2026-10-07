import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { categoryLogFile } from '../../server/lib/logger'
import { getDataDir } from '../../server/lib/paths'
import { invokeIpcForTests } from './helpers/testEnv'
import { getTestAgent, IPC_CHANNELS, useIntegrationEnv } from './helpers/testEnv'

function pendingFatalFile(): string {
  return join(getDataDir(), 'pending-fatal.json')
}

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

describe('crash reporting endpoints', () => {
  useIntegrationEnv()

  it('logs a client crash and returns the reference ID to show the user', async () => {
    const response = await getTestAgent().post('/api/diagnostics/client').send({
      message: 'Cannot read properties of undefined',
      stack: 'TypeError: Cannot read properties of undefined',
      source: 'window',
    })

    expect(response.status).toBe(200)
    expect(response.body.referenceId).toMatch(/^JTP-ERR-\d{8}-\d{3}$/)
    expect(response.body.version).toBeTruthy()

    const crashLog = readFileSync(categoryLogFile('crash'), 'utf8')
    expect(crashLog).toContain(response.body.referenceId)
    expect(crashLog).toContain('Uncaught error: Cannot read properties of undefined')
  })

  it('rejects a report that has no message', async () => {
    const response = await getTestAgent().post('/api/diagnostics/client').send({ source: 'window' })
    expect(response.status).toBe(400)
  })

  it('records a fatal host crash until the next launch acknowledges it', async () => {
    const response = await getTestAgent().post('/api/diagnostics/host').send({
      message: 'Renderer process gone: crashed (exit -36861)',
      detail: 'kind=1 reason=crashed exitCode=-36861',
      fatal: true,
    })

    expect(response.status).toBe(200)
    expect(readFileSync(categoryLogFile('crash'), 'utf8')).toContain(response.body.referenceId)

    const pending = await getTestAgent().get('/api/diagnostics/pending')
    expect(pending.body.referenceId).toBe(response.body.referenceId)
    expect(pending.body.message).toBe('Renderer process gone: crashed (exit -36861)')
    expect(pending.body.category).toBe('crash')
    expect(pending.body.stack).toBe('kind=1 reason=crashed exitCode=-36861')

    const ack = await getTestAgent().post('/api/diagnostics/pending/ack')
    expect(ack.status).toBe(204)
    expect(existsSync(pendingFatalFile())).toBe(false)

    const cleared = await getTestAgent().get('/api/diagnostics/pending')
    expect(cleared.body).toBeNull()
  })

  it('logs a recoverable host failure without showing it on the next launch', async () => {
    const response = await getTestAgent()
      .post('/api/diagnostics/host')
      .send({ message: 'Renderer became unresponsive', fatal: false })

    expect(response.status).toBe(200)
    expect(readFileSync(categoryLogFile('crash'), 'utf8')).toContain(response.body.referenceId)
    expect(existsSync(pendingFatalFile())).toBe(false)
  })
})
