import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { GoldSavingPayment, PaperSize } from '@shared/types'
import { api } from '../../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { applyPaperDataset, paperPageCss } from '../../invoices/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../../invoices/printPageUtils'
import { GsReceiptPrint } from './GsReceiptPrint'
import './GsReceiptPrint.css'

export function GsReceiptPrintPage() {
  const { id } = useParams()
  const [payment, setPayment] = useState<GoldSavingPayment | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [paperSize, setPaperSize] = useState<PaperSize>('a4')
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
        setPaperSize(settings.paperSizeCash === 'thermal' ? 'thermal' : 'a4')
        applyPaperDataset(settings.paperSizeCash === 'thermal' ? 'thermal' : 'a4')
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

  return (
    <div className="gs-receipt-print-page">
      <style>{paperPageCss(paperSize)}</style>
      {error ? <p className="gs-receipt-print-status gs-receipt-print-error">{error}</p> : null}
      {!error && !payment ? <p className="gs-receipt-print-status">Preparing receipt…</p> : null}
      {payment ? <GsReceiptPrint payment={payment} shop={shop ?? undefined} paperSize={paperSize} /> : null}
    </div>
  )
}
