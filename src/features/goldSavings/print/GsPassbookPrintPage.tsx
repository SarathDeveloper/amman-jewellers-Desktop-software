import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { GoldSavingPassbook } from '@shared/types'
import { api } from '../../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { applyPaperDataset } from '../../invoices/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../../invoices/printPageUtils'
import { GsPassbookPrint } from './GsPassbookPrint'
import './GsPassbookPrint.css'

export function GsPassbookPrintPage() {
  const { id } = useParams()
  const [passbook, setPassbook] = useState<GoldSavingPassbook | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const accountId = Number(id)
        if (!Number.isInteger(accountId) || accountId <= 0) throw new Error('Invalid account')
        const [next, settings] = await Promise.all([api.getGsPassbook(accountId), api.getShopSettings()])
        if (!active) return
        setPassbook(next)
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a4')
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load passbook')
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
    <div className="gs-passbook-print-page">
      {error ? <p className="gs-passbook-print-status">{error}</p> : null}
      {!error && !passbook ? <p className="gs-passbook-print-status">Preparing passbook…</p> : null}
      {passbook ? <GsPassbookPrint passbook={passbook} shop={shop ?? undefined} /> : null}
    </div>
  )
}
