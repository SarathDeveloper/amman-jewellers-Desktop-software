import type { DiagnosticReport, DiagnosticSource } from '@shared/types'

export async function reportFatal(input: {
  message: string
  stack?: string
  source: DiagnosticSource
}): Promise<DiagnosticReport> {
  return {
    referenceId: 'JTP-ERR-CLIENT',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    category: 'crash',
    message: input.message,
    stack: input.stack,
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

export function isTransientFatal(report: { message: string }): boolean {
  return /Renderer process gone \((killed|clean-exit)\)/.test(report.message)
}

export function loadPendingFatal(): Promise<DiagnosticReport | null> {
  return Promise.resolve(null)
}
