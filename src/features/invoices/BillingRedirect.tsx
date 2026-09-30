import { Navigate } from 'react-router-dom'

/** Legacy helper: typed list URLs now redirect to the unified billing list. */
export function BillingRedirect() {
  return <Navigate to="/billing" replace />
}
