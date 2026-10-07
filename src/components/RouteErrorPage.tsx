import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import type { DiagnosticReport } from '@shared/types'
import { FatalErrorScreen } from './FatalErrorScreen'
import { NotFoundPage } from './NotFoundPage'

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
  const error = useRouteError()
  // A 404 route response means the URL did not match any route. That is a
  // missing page, not a crash, so show the not-found screen without raising a
  // fatal `JTP-ERR-ROUTE` report.
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />
  }
  return <FatalErrorScreen error={reportFromUnknown(error)} />
}
