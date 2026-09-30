import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Pledge } from '@shared/types'
import { api } from '../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import { signalPrintReady, waitForPrintLayout } from '../invoices/printPageUtils'
import { PledgeReleasePrint } from './PledgeReleasePrint'
import './PledgePrint.css'

export function PledgeReleasePrintPage() {
  const { id } = useParams()
  const [pledge, setPledge] = useState<Pledge | null>(null)
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
        const [data, settings] = await Promise.all([
          api.getPledge(pledgeId),
          api.getShopSettings(),
        ])
        if (!active) return
        setShop(shopSettingsToDisplay(settings))
        setPledge(data)
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
          signalPrintReady(err instanceof Error ? err.message : 'Failed to prepare release receipt')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pledge, error])

  return (
    <div className="pledge-print-page">
      {error && <p className="pledge-print-status pledge-print-error">{error}</p>}
      {!error && !pledge && <p className="pledge-print-status">Preparing gold release receipt…</p>}
      {pledge && <PledgeReleasePrint pledge={pledge} shop={shop ?? undefined} />}
    </div>
  )
}
