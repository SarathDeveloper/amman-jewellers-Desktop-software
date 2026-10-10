import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Pledge, PledgeAuction } from '@shared/types'
import { api } from '../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import { applyPaperDataset, paperPageCss } from '../invoices/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../invoices/printPageUtils'
import { PledgeNoticePrint } from './PledgeNoticePrint'
import '../invoices/TaxInvoicePrint.css'
import './PledgePrint.css'

export function PledgeNoticePrintPage() {
  const { id } = useParams()
  const [pledge, setPledge] = useState<Pledge | null>(null)
  const [auction, setAuction] = useState<PledgeAuction | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const pledgeId = Number(id)
        if (!Number.isInteger(pledgeId) || pledgeId <= 0) {
          throw new Error('Invalid pledge id')
        }
        const [data, auctionRow, settings] = await Promise.all([
          api.getPledge(pledgeId),
          api.getPledgeAuction(pledgeId),
          api.getShopSettings(),
        ])
        if (!active) return
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a4')
        setPledge(data)
        setAuction(auctionRow)
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load pledge')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!pledge && !error) return

    let cancelled = false
    void (async () => {
      try {
        if (pledge) {
          await waitForPrintLayout()
        }
        if (cancelled) return
        signalPrintReady(error)
      } catch (err) {
        if (!cancelled) {
          signalPrintReady(err instanceof Error ? err.message : 'Failed to prepare auction notice')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pledge, error])

  return (
    <div className="pledge-print-page">
      <style>{paperPageCss('a4')}</style>
      {error && <p className="pledge-print-status pledge-print-error">{error}</p>}
      {!error && !pledge && <p className="pledge-print-status">Preparing auction notice…</p>}
      {pledge && <PledgeNoticePrint pledge={pledge} auction={auction} shop={shop ?? undefined} />}
    </div>
  )
}
