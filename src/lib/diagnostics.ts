import type { DiagnosticReport, DiagnosticSource } from '@shared/types'

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as T
  } catch {
    return null
  }
}

/**
 * Reports a fatal error to the API so it is written to `crash.log` with a
 * `JTP-ERR-…` reference ID the user can quote. Runs inside error handling, so
 * it never throws: if the API cannot be reached it falls back to a local report.
 */
export async function reportFatal(input: {
  message: string
  stack?: string
  source: DiagnosticSource
}): Promise<DiagnosticReport> {
  const reported = await postJson<{ referenceId: string; timestamp: string; version: string }>(
    '/api/diagnostics/client',
    input,
  )
  if (reported) {
    return {
      referenceId: reported.referenceId,
      timestamp: reported.timestamp,
      version: reported.version,
      category: 'crash',
      message: input.message,
      ...(input.stack ? { stack: input.stack } : {}),
    }
  }

  return {
    referenceId: 'JTP-ERR-CLIENT',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    category: 'crash',
    message: input.message,
    ...(input.stack ? { stack: input.stack } : {}),
  }
}

export function formatErrorReport(report: DiagnosticReport): string {
  const lines = [
    `Reference ID: ${report.referenceId}`,
    `Time: ${report.timestamp}`,
    `App version: ${report.version}`,
    `Category: ${report.category}`,
    `Message: ${report.message}`,
  ]
  if (report.stack) {
    lines.push(`Stack: ${report.stack}`)
  }
  return lines.join('\n')
}

export function isPrintRoute(): boolean {
  return window.location.pathname.includes('/print/')
}

/**
 * True for reports that describe something ending rather than failing — a window
 * being closed, or a process the host deliberately stopped — which is not worth
 * showing to the user on the next launch.
 */
export function isTransientFatal(report: { message: string }): boolean {
  return /Renderer process gone[:\s]+\(?(killed|clean-exit|exited|terminated)\b/i.test(report.message)
}

export function isExpectedApiFailure(message: string): boolean {
  return /^(Not found|Authentication required|Permission denied|Request failed)/i.test(message.trim())
}

/**
 * A crash the desktop shell could not recover from, recorded by the API so the
 * next launch can show its reference ID instead of starting silently.
 */
export async function loadPendingFatal(): Promise<DiagnosticReport | null> {
  try {
    const response = await fetch('/api/diagnostics/pending', { credentials: 'same-origin' })
    if (!response.ok) {
      return null
    }
    const payload = (await response.json()) as DiagnosticReport | null
    if (!payload || typeof payload.message !== 'string') {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/** Marks the pending crash as seen, so the next launch starts normally. */
export async function ackPendingFatal(): Promise<void> {
  try {
    await fetch('/api/diagnostics/pending/ack', { method: 'POST', credentials: 'same-origin' })
  } catch {
    // Nothing to do: the message would simply be shown once more.
  }
}
