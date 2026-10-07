import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { PaperSize } from '@shared/types'
import { api } from '../../lib/api'
import { buildTaxInvoiceData } from './buildTaxInvoiceData'
import { shopSettingsToDisplay, type ShopDisplayInfo } from './mapShopDisplay'
import { applyPaperDataset, paperPageCss } from './paperSize'
import { signalPrintReady, waitForPrintLayout } from './printPageUtils'
import { TaxInvoicePrint } from './TaxInvoicePrint'
import type { TaxInvoiceData } from './taxInvoiceTypes'
import './TaxInvoicePrint.css'

export function TaxInvoicePrintPage() {
  const { id } = useParams()
  const [data, setData] = useState<TaxInvoiceData | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [paperSize, setPaperSize] = useState<PaperSize>('a4')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const invoiceId = Number(id)
        if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
          throw new Error('Invalid invoice id')
        }
        // Settings, rates, and the customer id do not depend on each other, so
        // only the invoice itself has to arrive before its customer is known.
        const invoicePromise = api.getInvoice(invoiceId)
        const customerPromise = invoicePromise.then((invoice) => api.getCustomer(invoice.customerId))
        const [invoice, customer, settings, rates] = await Promise.all([
          invoicePromise,
          customerPromise,
          api.getShopSettings(),
          api.getLatestMetalRates(),
        ])
        if (!active) return
        setShop(shopSettingsToDisplay(settings))
        setPaperSize(settings.paperSizeTax)
        applyPaperDataset(settings.paperSizeTax)
        setData(buildTaxInvoiceData(invoice, customer, rates))
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load tax invoice')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!data && !error) return

    let cancelled = false
    void (async () => {
      try {
        if (data) {
          await waitForPrintLayout()
        }
        if (cancelled) return
        signalPrintReady(error)
      } catch (err) {
        if (!cancelled) {
          signalPrintReady(
            err instanceof Error ? err.message : 'Failed to prepare tax invoice',
          )
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [data, error])

  return (
    <div className="tax-invoice-print-page">
      <style>{paperPageCss(paperSize)}</style>
      {error && <p className="tax-invoice-print-status tax-invoice-print-error">{error}</p>}
      {!error && !data && <p className="tax-invoice-print-status">Preparing tax invoice…</p>}
      {data && <TaxInvoicePrint data={data} shop={shop ?? undefined} paperSize={paperSize} />}
    </div>
  )
}
