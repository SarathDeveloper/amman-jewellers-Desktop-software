import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import type { DiagnosticReport } from '@shared/types'
import { FatalErrorScreen } from './FatalErrorScreen'

function reportFromUnknown(error: unknown): DiagnosticReport {
  if (isRouteErrorResponse(error)) {
    return {
      referenceId: 'JTP-ERR-ROUTE',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      category: 'crash',
      message: error.statusText || `Route error ${error.status}`,
    }
  }
  if (error instanceof Error) {
    return {
      referenceId: 'JTP-ERR-ROUTE',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      category: 'crash',
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    referenceId: 'JTP-ERR-ROUTE',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    category: 'crash',
    message: String(error),
  }
}

export function RouteErrorPage() {
  return <FatalErrorScreen error={reportFromUnknown(useRouteError())} />
}
