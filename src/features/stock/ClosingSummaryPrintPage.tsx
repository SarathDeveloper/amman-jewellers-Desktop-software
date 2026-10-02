import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { MetalDayClosingSheet } from '@shared/types'
import { api } from '../../lib/api'
import { formatDisplayDate } from '../../lib/format'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import { signalPrintReady, waitForPrintLayout } from '../invoices/printPageUtils'
import {
  ClosingMetalBlock,
  parseClosingSummaryMode,
} from './ClosingStockSummary'

export function ClosingSummaryPrintPage() {
  const { date } = useParams()
  const [searchParams] = useSearchParams()
  const mode = parseClosingSummaryMode(searchParams.get('mode'))
  const [goldSheet, setGoldSheet] = useState<MetalDayClosingSheet | null>(null)
  const [silverSheet, setSilverSheet] = useState<MetalDayClosingSheet | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (!date) {
          throw new Error('Invalid print route')
        }
        const [goldDay, silverDay, settings] = await Promise.all([
          api.getMetalDayClosing(date, 'Gold'),
          api.getMetalDayClosing(date, 'Silver'),
          api.getShopSettings(),
        ])
        if (!active) return
        setGoldSheet(goldDay)
        setSilverSheet(silverDay)
        setShop(shopSettingsToDisplay(settings))
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load closing stock summary')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [date])

  useEffect(() => {
    if (error) {
      signalPrintReady(error)
      return
    }
    if (!goldSheet || !silverSheet || !shop) return
    let cancelled = false
    void (async () => {
      await waitForPrintLayout()
      if (!cancelled) signalPrintReady(null)
    })()
    return () => {
      cancelled = true
    }
  }, [goldSheet, silverSheet, shop, error])

  if (error) {
    return <p className="error-banner">{error}</p>
  }
  if (!goldSheet || !silverSheet || !shop || !date) {
    return <p>Loading…</p>
  }

  return (
    <div className="print-page metal-day-print">
      <header>
        <h1>{shop.name}</h1>
        <p>Closing stock summary — {formatDisplayDate(date)}</p>
        <p>{mode === 'transacted' ? 'Transacted categories only' : 'All categories'}</p>
      </header>
      <div className="stock-closing-summary">
        <ClosingMetalBlock
          metal="Gold"
          date={date}
          rows={goldSheet.rows}
          status={goldSheet.status}
          mode={mode}
        />
        <ClosingMetalBlock
          metal="Silver"
          date={date}
          rows={silverSheet.rows}
          status={silverSheet.status}
          mode={mode}
        />
      </div>
    </div>
  )
}
