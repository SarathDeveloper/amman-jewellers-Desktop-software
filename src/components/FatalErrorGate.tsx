import { useEffect, useState, type ReactNode } from 'react'
import type { DiagnosticReport } from '@shared/types'
import { isPrintRoute, isTransientFatal, loadPendingFatal, reportFatal } from '../lib/diagnostics'
import { FatalErrorScreen } from './FatalErrorScreen'

export function FatalErrorGate({ children }: { children: ReactNode }) {
  const [fatal, setFatal] = useState<DiagnosticReport | null>(null)

  useEffect(() => {
    if (isPrintRoute()) {
      return
    }

    let cancelled = false

    void loadPendingFatal().then((pending) => {
      if (!cancelled && pending && !isTransientFatal(pending)) {
        setFatal(pending)
      }
    })

    function onError(event: ErrorEvent): void {
      const message = event.error instanceof Error ? event.error.message : event.message
      if (/ResizeObserver loop|Script error\.?/i.test(message)) return
      const stack = event.error instanceof Error ? event.error.stack : undefined
      void reportFatal({ message, stack, source: 'window' }).then((report) => {
        if (!cancelled) {
          setFatal(report)
        }
      })
    }

    function onRejection(event: PromiseRejectionEvent): void {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : String(reason)
      const stack = reason instanceof Error ? reason.stack : undefined
      void reportFatal({ message, stack, source: 'rejection' }).then((report) => {
        if (!cancelled) {
          setFatal(report)
        }
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      cancelled = true
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  if (fatal) {
    return <FatalErrorScreen error={fatal} />
  }

  return children
}
