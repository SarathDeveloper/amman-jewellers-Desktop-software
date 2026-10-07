import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { GoldSavingPassbook } from '@shared/types'
import { api } from '../../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { applyPaperDataset } from '../../invoices/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../../invoices/printPageUtils'
import { GsPassbookPrint } from './GsPassbookPrint'
import './GsPassbookPrint.css'

export function GsReceiptPrintPage() {
  const { id } = useParams()
  const [passbook, setPassbook] = useState<GoldSavingPassbook | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const paymentId = Number(id)
        if (!Number.isInteger(paymentId) || paymentId <= 0) throw new Error('Invalid receipt')
        // The passbook fetch needs the payment's account id, so it is chained
        // off the payment request instead of running after everything else.
        const paymentPromise = api.getGsPayment(paymentId)
        const [, settings, pb] = await Promise.all([
          paymentPromise,
          api.getShopSettings(),
          paymentPromise.then((payment) => api.getGsPassbook(payment.accountId)),
        ])
        if (!active) return
        setPassbook(pb)
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a4')
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load receipt')
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!passbook && !error) return
    let cancelled = false
    void (async () => {
      if (passbook) await waitForPrintLayout()
      if (!cancelled) signalPrintReady(error)
    })()
    return () => {
      cancelled = true
    }
  }, [passbook, error])

  return (
    <div className="gs-receipt-print-page">
      {error ? <p className="gs-receipt-print-status gs-receipt-print-error">{error}</p> : null}
      {!error && !passbook ? <p className="gs-receipt-print-status">Preparing receipt…</p> : null}
      {passbook ? <GsPassbookPrint passbook={passbook} shop={shop ?? undefined} /> : null}
    </div>
  )
}
