import { useState } from 'react'
import type { DiagnosticReport } from '@shared/types'
import { formatErrorReport } from '../lib/diagnostics'

type Props = {
  error: DiagnosticReport
}

export function FatalErrorScreen({ error }: Props) {
  const [copied, setCopied] = useState(false)
  const canCopy = !error.referenceId.includes('…')

  async function copyError(): Promise<void> {
    if (!canCopy) {
      return
    }
    const text = formatErrorReport(error)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', 'true')
      area.style.position = 'fixed'
      area.style.left = '-9999px'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function restartApplication(): Promise<void> {
    window.location.reload()
  }

  return (
    <div className="app-error-boundary">
      <div className="card padded app-error-boundary-card">
        <h1>Something went wrong.</h1>
        <p className="app-error-boundary-ref">Reference ID: {error.referenceId}</p>
        <div className="app-error-boundary-actions">
          <button type="button" className="btn" disabled={!canCopy} onClick={() => void copyError()}>
            {copied ? 'Copied' : 'Copy Error'}
          </button>
          <button type="button" className="btn secondary" onClick={() => void restartApplication()}>
            Restart Application
          </button>
        </div>
      </div>
    </div>
  )
}
