import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { GoldSavingRefund } from '@shared/types'
import { api } from '../../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { applyPaperDataset } from '../../invoices/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../../invoices/printPageUtils'
import { GsRefundPrint } from './GsRefundPrint'
import './GsReceiptPrint.css'

export function GsRefundPrintPage() {
  const { id } = useParams()
  const [refund, setRefund] = useState<GoldSavingRefund | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const refundId = Number(id)
        if (!Number.isInteger(refundId) || refundId <= 0) throw new Error('Invalid refund voucher')
        const [next, settings] = await Promise.all([api.getGsRefund(refundId), api.getShopSettings()])
        if (!active) return
        setRefund(next)
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a4')
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load refund voucher')
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!refund && !error) return
    let cancelled = false
    void (async () => {
      if (refund) await waitForPrintLayout()
      if (!cancelled) signalPrintReady(error)
    })()
    return () => {
      cancelled = true
    }
  }, [refund, error])

  return (
    <div className="gs-receipt-print-page">
      {error ? <p className="gs-receipt-print-status gs-receipt-print-error">{error}</p> : null}
      {!error && !refund ? <p className="gs-receipt-print-status">Preparing refund voucher…</p> : null}
      {refund ? <GsRefundPrint refund={refund} shop={shop ?? undefined} /> : null}
    </div>
  )
}
