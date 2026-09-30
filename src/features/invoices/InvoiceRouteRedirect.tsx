import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { LoadingState } from '../../components/LoadingState'
import { api } from '../../lib/api'
import { getBillingType, salePathForFormat, type SaleBillingType } from './billingType'

/** Redirect legacy /billing/new and /billing/:id to cash or tax routes. */
export function InvoiceRouteRedirect({ mode }: { mode: 'new' | 'edit' }) {
  const { id } = useParams()
  const [target, setTarget] = useState<string | null>(mode === 'new' ? null : null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'new') {
      const type = getBillingType()
      const saleType: SaleBillingType = type === 'tax_invoice' ? 'tax_invoice' : 'cash_bill'
      setTarget(salePathForFormat(saleType))
      return
    }

    let active = true
    void (async () => {
      try {
        const invoiceId = Number(id)
        if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
          throw new Error('Invalid bill')
        }
        const invoice = await api.getInvoice(invoiceId)
        if (!active) return
        const format = invoice.billFormat === 'tax_invoice' ? 'tax_invoice' : 'cash_bill'
        setTarget(salePathForFormat(format, invoice.id))
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to open bill')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [id, mode])

  if (error) {
    return <div className="error-banner">{error}</div>
  }
  if (!target) {
    return <LoadingState />
  }
  return <Navigate to={target} replace />
}
