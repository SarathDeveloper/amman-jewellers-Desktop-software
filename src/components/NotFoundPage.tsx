import { Link, useLocation } from 'react-router-dom'

/**
 * Friendly fallback for URLs that do not match any route.
 *
 * React Router raises a 404 route error for unmatched paths; without this the
 * top-level error element renders the fatal "Something went wrong" crash screen
 * and reports a `JTP-ERR-ROUTE` crash, which is misleading for a missing page.
 */
export function NotFoundPage() {
  const location = useLocation()

  return (
    <div className="app-error-boundary">
      <div className="card padded app-error-boundary-card">
        <h1>Page not found</h1>
        <p>This page doesn&apos;t exist. It may have been moved, or the link is incorrect.</p>
        <p className="app-error-boundary-ref">{location.pathname}</p>
        <div className="app-error-boundary-actions">
          <Link to="/dashboard" className="btn">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
