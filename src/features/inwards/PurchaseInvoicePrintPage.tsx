import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import { applyPaperDataset, paperPageCss } from '../invoices/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../invoices/printPageUtils'
import { buildPurchaseInvoiceData } from './buildPurchaseInvoiceData'
import { PurchaseInvoicePrint } from './PurchaseInvoicePrint'
import type { PurchaseInvoiceData } from './purchaseInvoiceTypes'
import './PurchaseInvoicePrint.css'

export function PurchaseInvoicePrintPage() {
  const { id } = useParams()
  const [data, setData] = useState<PurchaseInvoiceData | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const inwardId = Number(id)
        if (!Number.isInteger(inwardId) || inwardId <= 0) {
          throw new Error('Invalid purchase id')
        }
        const [inward, settings] = await Promise.all([api.getInward(inwardId), api.getShopSettings()])
        if (!active) return
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a4')
        setData(buildPurchaseInvoiceData(inward))
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load purchase invoice')
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
          signalPrintReady(err instanceof Error ? err.message : 'Failed to prepare purchase invoice')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [data, error])

  return (
    <div className="purchase-invoice-print-page">
      <style>{paperPageCss('a4')}</style>
      {error && <p className="purchase-invoice-print-status purchase-invoice-print-error">{error}</p>}
      {!error && !data && (
        <p className="purchase-invoice-print-status">Preparing purchase invoice…</p>
      )}
      {data && <PurchaseInvoicePrint data={data} shop={shop ?? undefined} />}
    </div>
  )
}
