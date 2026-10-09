import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Customer, OldGoldPurchase } from '@shared/types'
import { api } from '../../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { applyPaperDataset, paperPageCss } from '../../invoices/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../../invoices/printPageUtils'
import { OldGoldPurchasePrint } from './OldGoldPurchasePrint'
import './OldGoldPurchasePrint.css'

export function OldGoldPurchasePrintPage() {
  const { id } = useParams()
  const [purchase, setPurchase] = useState<OldGoldPurchase | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const purchaseId = Number(id)
        if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
          throw new Error('Invalid old gold purchase id')
        }
        const [loaded, settings] = await Promise.all([
          api.getOldGoldPurchase(purchaseId),
          api.getShopSettings(),
        ])
        if (!active) return
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a4')
        setPurchase(loaded)
        if (loaded.customerId != null) {
          const record = await api.getCustomer(loaded.customerId).catch(() => null)
          if (active) setCustomer(record)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load old gold purchase')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!purchase && !error) return

    let cancelled = false
    void (async () => {
      try {
        if (purchase) {
          await waitForPrintLayout()
        }
        if (cancelled) return
        signalPrintReady(error)
      } catch (err) {
        if (!cancelled) {
          signalPrintReady(err instanceof Error ? err.message : 'Failed to prepare old gold purchase')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [purchase, error])

  return (
    <div className="ogp-print-root">
      <style>{paperPageCss('a4')}</style>
      {error && <p className="ogp-print-status">{error}</p>}
      {!error && !purchase && <p className="ogp-print-status">Preparing old gold purchase…</p>}
      {purchase && <OldGoldPurchasePrint purchase={purchase} customer={customer} shop={shop ?? undefined} />}
    </div>
  )
}
