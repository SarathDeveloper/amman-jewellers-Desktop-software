import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { classifyFailure, isExpectedError } from '../../server/lib/diagnostics'
import { clearPendingFatal, readPendingFatal, writePendingFatal } from '../../server/lib/pendingFatal'
import { formatErrorReport, isTransientFatal } from '../../src/lib/diagnostics'
import { formatDisplayDateTime } from '../../src/lib/format'
import {
  categoryLogFile,
  logDiagnostic,
  logInfo,
  nextReferenceId,
  resetLoggerStateForTests,
  todayStamp,
} from '../../server/lib/logger'

function setTempUserData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'jtp-logs-'))
  process.env.JEWELTRACKERPRO_E2E_USER_DATA = dir
  resetLoggerStateForTests()
  return dir
}

describe('diagnostic classification', () => {
  it('skips expected shop-facing errors', () => {
    expect(isExpectedError(new Error('Export cancelled'))).toBe(true)
    expect(isExpectedError(new Error('Invoice not found'))).toBe(true)
    expect(isExpectedError(new Error('Insufficient stock for Ring'))).toBe(true)
    expect(isExpectedError(new ZodError([]))).toBe(true)
    expect(isExpectedError({ name: 'SqliteError', code: 'SQLITE_CONSTRAINT', message: 'UNIQUE' })).toBe(
      true,
    )
  })

  it('logs backup file problems and unexpected failures', () => {
    expect(isExpectedError(new Error('Backup file was not found'))).toBe(false)
    expect(isExpectedError(new Error('Backup file is damaged and cannot be used'))).toBe(false)
    expect(isExpectedError(new Error('disk I/O error'))).toBe(false)
  })

  it('routes unexpected failures to category files', () => {
    expect(classifyFailure('/api/products', new Error('Invoice not found'))).toBeNull()
    expect(classifyFailure('/api/backup/restore', new Error('Backup file was not found'))).toBe('backup')
    expect(
      classifyFailure('/api/products', { name: 'SqliteError', code: 'SQLITE_IOERR', message: 'disk I/O' }),
    ).toBe('database')
    expect(classifyFailure('/api/products', new Error('disk I/O error'))).toBe('application')
  })
})

describe('diagnostic logger', () => {
  let tempDir = ''

  beforeEach(() => {
    tempDir = setTempUserData()
  })

  afterEach(() => {
    resetLoggerStateForTests()
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.JEWELTRACKERPRO_E2E_USER_DATA
  })

  it('issues daily reference IDs in sequence', () => {
    const date = todayStamp()
    expect(nextReferenceId()).toBe(`JTP-ERR-${date}-001`)
    expect(nextReferenceId()).toBe(`JTP-ERR-${date}-002`)
  })

  it('writes each category to its own log file', () => {
    const app = logDiagnostic('application', 'Unexpected app failure', new Error('boom'))
    const db = logDiagnostic('database', 'SQLite failed', new Error('disk I/O'))
    const printer = logDiagnostic('printer', 'Print failed', new Error('no toner'))
    const crash = logDiagnostic('crash', 'uncaughtException', new Error('crash'))
    const backup = logDiagnostic('backup', 'Daily backup failed', new Error('no space'))

    expect(readFileSync(categoryLogFile('application'), 'utf8')).toContain(app.referenceId)
    expect(readFileSync(categoryLogFile('database'), 'utf8')).toContain(db.referenceId)
    expect(readFileSync(categoryLogFile('printer'), 'utf8')).toContain(printer.referenceId)
    expect(readFileSync(categoryLogFile('crash'), 'utf8')).toContain(crash.referenceId)
    expect(readFileSync(categoryLogFile('backup'), 'utf8')).toContain(backup.referenceId)
  })

  it('writes startup lines without a reference ID', () => {
    logInfo('application', 'Application started')
    const text = readFileSync(categoryLogFile('application'), 'utf8')
    expect(text).toContain('Application started')
    expect(text).not.toMatch(/JTP-ERR-/)
  })

  it('rotates a log file after 1 MB and keeps one previous copy', () => {
    const file = categoryLogFile('application')
    mkdirSync(join(tempDir, 'logs'), { recursive: true })
    writeFileSync(file, 'x'.repeat(1024 * 1024), 'utf8')
    logInfo('application', 'after rotation')

    expect(existsSync(`${file}.1`)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('after rotation')
    expect(readFileSync(`${file}.1`, 'utf8').length).toBe(1024 * 1024)
  })

  it('formats a support clipboard report', () => {
    expect(
      formatErrorReport({
        referenceId: 'JTP-ERR-20260925-001',
        timestamp: '2026-09-25T05:00:00.000Z',
        version: '1.0.0',
        category: 'crash',
        message: 'App render failed',
        stack: 'Error: App render failed',
      }),
    ).toBe(
      [
        'Reference ID: JTP-ERR-20260925-001',
        `Time: ${formatDisplayDateTime('2026-09-25T05:00:00.000Z')}`,
        'App version: 1.0.0',
        'Category: crash',
        'Message: App render failed',
        'Stack: Error: App render failed',
      ].join('\n'),
    )
  })

  it('treats renderer-gone messages as transient only for clean exits', () => {
    expect(isTransientFatal({ message: 'Renderer process gone (killed)' })).toBe(true)
    expect(isTransientFatal({ message: 'Renderer process gone (crashed)' })).toBe(false)
    expect(isTransientFatal({ message: 'Renderer process gone: terminated (exit 0)' })).toBe(true)
    expect(isTransientFatal({ message: 'Renderer process gone: exited (exit 0)' })).toBe(true)
    expect(isTransientFatal({ message: 'Renderer process gone: crashed (exit -36861)' })).toBe(false)
    expect(isTransientFatal({ message: 'WebView2 browser process exited (exit 1)' })).toBe(false)
    expect(isTransientFatal({ message: 'Renderer became unresponsive' })).toBe(false)
  })
})

describe('pending fatal marker', () => {
  let tempDir = ''

  beforeEach(() => {
    tempDir = setTempUserData()
  })

  afterEach(() => {
    resetLoggerStateForTests()
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.JEWELTRACKERPRO_E2E_USER_DATA
  })

  it('keeps an unrecovered crash until it is acknowledged', () => {
    expect(readPendingFatal()).toBeNull()

    writePendingFatal({
      referenceId: 'JTP-ERR-20261007-001',
      timestamp: '2026-10-07T10:51:46.650Z',
      version: '1.0.0',
      category: 'crash',
      message: 'Renderer process gone: crashed (exit -36861)',
    })

    expect(readPendingFatal()).toEqual({
      referenceId: 'JTP-ERR-20261007-001',
      timestamp: '2026-10-07T10:51:46.650Z',
      version: '1.0.0',
      category: 'crash',
      message: 'Renderer process gone: crashed (exit -36861)',
    })

    clearPendingFatal()
    expect(readPendingFatal()).toBeNull()
  })

  it('ignores a damaged marker instead of failing the launch', () => {
    mkdirSync(join(tempDir, 'logs'), { recursive: true })
    writeFileSync(join(tempDir, 'pending-fatal.json'), 'not json at all', 'utf8')
    expect(readPendingFatal()).toBeNull()
  })
})
