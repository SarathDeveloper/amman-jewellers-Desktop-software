import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { GoldSavingPayment } from '@shared/types'
import { api } from '../../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { applyPaperDataset } from '../../invoices/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../../invoices/printPageUtils'
import { GsReceiptPrint } from './GsReceiptPrint'
import './GsReceiptPrint.css'

/**
 * Collection receipt. When the payment belongs to a multi-installment batch the
 * document lists every installment in that batch, with the batch totals.
 */
export function GsBatchReceiptPrintPage() {
  const { id } = useParams()
  const [payment, setPayment] = useState<GoldSavingPayment | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const paymentId = Number(id)
        if (!Number.isInteger(paymentId) || paymentId <= 0) throw new Error('Invalid receipt')
        const [next, settings] = await Promise.all([api.getGsPayment(paymentId), api.getShopSettings()])
        if (!active) return
        setPayment(next)
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
    if (!payment && !error) return
    let cancelled = false
    void (async () => {
      if (payment) await waitForPrintLayout()
      if (!cancelled) signalPrintReady(error)
    })()
    return () => {
      cancelled = true
    }
  }, [payment, error])

  const rows = payment ? (payment.batchPayments?.length ? payment.batchPayments : [payment]) : []

  return (
    <div className="gs-receipt-print-page">
      {error ? <p className="gs-receipt-print-status gs-receipt-print-error">{error}</p> : null}
      {!error && !payment ? <p className="gs-receipt-print-status">Preparing receipt…</p> : null}
      {payment ? <GsReceiptPrint payments={rows} shop={shop ?? undefined} /> : null}
    </div>
  )
}
