import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiagnosticReport } from '@shared/types'
import { getDataDir } from './paths'

/**
 * A crash the desktop shell could not recover from, kept so the next launch can
 * show its reference ID instead of starting silently. Lives next to the data so
 * the Rust shell can rely on the same folder.
 */
function pendingFatalPath(): string {
  return join(getDataDir(), 'pending-fatal.json')
}

export function writePendingFatal(report: DiagnosticReport): void {
  try {
    writeFileSync(pendingFatalPath(), JSON.stringify(report), 'utf8')
  } catch {
    // A missing marker only costs one diagnostic message.
  }
}

export function readPendingFatal(): DiagnosticReport | null {
  try {
    const file = pendingFatalPath()
    if (!existsSync(file)) {
      return null
    }
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DiagnosticReport> | null
    if (!parsed || typeof parsed.referenceId !== 'string' || typeof parsed.message !== 'string') {
      return null
    }
    return {
      referenceId: parsed.referenceId,
      timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : new Date().toISOString(),
      version: typeof parsed.version === 'string' ? parsed.version : '',
      category: 'crash',
      message: parsed.message,
      ...(typeof parsed.stack === 'string' && parsed.stack ? { stack: parsed.stack } : {}),
    }
  } catch {
    return null
  }
}

export function clearPendingFatal(): void {
  try {
    rmSync(pendingFatalPath(), { force: true })
  } catch {
    // Nothing to clear.
  }
}
