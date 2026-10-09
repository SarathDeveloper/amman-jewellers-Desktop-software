import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { PaperSize } from '@shared/types'
import { api } from '../../lib/api'
import { buildCashBillData } from './buildCashBillData'
import { CashBillPrint } from './CashBillPrint'
import type { CashBillData } from './cashBillTypes'
import { shopSettingsToDisplay } from './mapShopDisplay'
import type { ShopDisplayInfo } from './mapShopDisplay'
import { applyPaperDataset, paperPageCss } from './paperSize'
import { signalPrintReady, waitForPrintLayout } from './printPageUtils'
import './CashBillPrint.css'

export function CashBillPrintPage() {
  const { id } = useParams()
  const [data, setData] = useState<CashBillData | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [paperSize, setPaperSize] = useState<PaperSize>('a5')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const invoiceId = Number(id)
        if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
          throw new Error('Invalid invoice id')
        }
        // Everything except the customer can start immediately; the customer id
        // only becomes known once the invoice arrives, so that request is
        // chained off it rather than awaited in sequence. A finalized bill
        // carries its own customer snapshot, so the lookup is skipped then.
        const invoicePromise = api.getInvoice(invoiceId)
        const customerPromise = invoicePromise.then((invoice) =>
          invoice.customerSnapshot
            ? undefined
            : api.getCustomer(invoice.customerId).catch(() => undefined),
        )
        const [invoice, customer, settings, rates] = await Promise.all([
          invoicePromise,
          customerPromise,
          api.getShopSettings(),
          api.getLatestMetalRates(),
        ])
        if (!active) return
        setShop(shopSettingsToDisplay(settings))
        setPaperSize(settings.paperSizeCash)
        applyPaperDataset(settings.paperSizeCash)
        setData(
          buildCashBillData(invoice, {
            customer: invoice.customerSnapshot ?? customer,
            rates: invoice.ratesSnapshot ?? rates,
          }),
        )
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load cash bill')
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
          signalPrintReady(err instanceof Error ? err.message : 'Failed to prepare cash bill')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [data, error])

  return (
    <div className="cash-bill-print-page">
      <style>{paperPageCss(paperSize)}</style>
      {error && <p className="cash-bill-print-status cash-bill-print-error">{error}</p>}
      {!error && !data && <p className="cash-bill-print-status">Preparing cash bill…</p>}
      {data && <CashBillPrint data={data} shop={shop ?? undefined} paperSize={paperSize} />}
    </div>
  )
}
