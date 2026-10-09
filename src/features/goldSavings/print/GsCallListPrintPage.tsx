import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { GoldSavingReportResult } from '@shared/types'
import { api } from '../../../lib/api'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../../invoices/mapShopDisplay'
import { applyPaperDataset } from '../../invoices/paperSize'
import { signalPrintReady, waitForPrintLayout } from '../../invoices/printPageUtils'
import { GsCallListPrint } from './GsCallListPrint'
import './GsCallListPrint.css'

export function GsCallListPrintPage() {
  const [searchParams] = useSearchParams()
  const bucket = searchParams.get('bucket') ?? ''
  const schemeId = searchParams.get('schemeId')
  const q = searchParams.get('q')
  const [report, setReport] = useState<GoldSavingReportResult | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [next, settings] = await Promise.all([
          api.runGsReport('overdue-aging', {
            schemeId: schemeId ? Number(schemeId) : undefined,
            q: q || undefined,
          }),
          api.getShopSettings(),
        ])
        if (!active) return
        setReport(next)
        setShop(shopSettingsToDisplay(settings))
        applyPaperDataset('a4')
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load call list')
      }
    })()
    return () => {
      active = false
    }
  }, [schemeId, q])

  useEffect(() => {
    if (error) {
      signalPrintReady(error)
      return
    }
    if (!report || !shop) return
    let cancelled = false
    void (async () => {
      await waitForPrintLayout()
      if (!cancelled) signalPrintReady(null)
    })()
    return () => {
      cancelled = true
    }
  }, [report, shop, error])

  if (error) {
    return <p className="gs-call-list-status gs-call-list-error">{error}</p>
  }
  if (!report || !shop) {
    return <p className="gs-call-list-status">Preparing call list…</p>
  }

  const title = bucket ? `${report.title} · ${bucket}` : report.title
  return <GsCallListPrint report={report} bucket={bucket} title={title} shop={shop} />
}
