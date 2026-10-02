import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { MetalDayClosingSheet } from '@shared/types'
import { STOCK_METALS, type StockMetal } from '@shared/itemTypes'
import { api } from '../../lib/api'
import { formatDisplayDate, formatWeight } from '../../lib/format'
import { shopSettingsToDisplay, type ShopDisplayInfo } from '../invoices/mapShopDisplay'
import { signalPrintReady, waitForPrintLayout } from '../invoices/printPageUtils'

export function MetalDayPrintPage() {
  const { date, metal: metalParam } = useParams()
  const [sheet, setSheet] = useState<MetalDayClosingSheet | null>(null)
  const [shop, setShop] = useState<ShopDisplayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const metal = (STOCK_METALS as readonly string[]).includes(metalParam ?? '')
          ? (metalParam as StockMetal)
          : null
        if (!date || !metal) {
          throw new Error('Invalid print route')
        }
        const [daySheet, settings] = await Promise.all([
          api.getMetalDayClosing(date, metal),
          api.getShopSettings(),
        ])
        if (!active) return
        setSheet(daySheet)
        setShop(shopSettingsToDisplay(settings))
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load metal day report')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [date, metalParam])

  useEffect(() => {
    if (!sheet && !error) return
    let cancelled = false
    void (async () => {
      if (sheet) await waitForPrintLayout()
      if (!cancelled) signalPrintReady(error)
    })()
    return () => {
      cancelled = true
    }
  }, [sheet, error])

  if (error) {
    return <p className="error-banner">{error}</p>
  }
  if (!sheet || !shop) {
    return <p>Loading…</p>
  }

  const totals = sheet.rows.reduce(
    (acc, row) => ({
      opening: acc.opening + row.openingWeight,
      inward: acc.inward + row.autoPurchaseIn,
      sales: acc.sales + row.effectiveSales,
      closing: acc.closing + row.closingWeight,
    }),
    { opening: 0, inward: 0, sales: 0, closing: 0 },
  )

  return (
    <div className="print-page metal-day-print">
      <header>
        <h1>{shop.name}</h1>
        <p>
          {sheet.metal} day report — {formatDisplayDate(sheet.businessDate)}
          {sheet.status === 'closed' ? ` (Closed by ${sheet.operatorName || '—'})` : ' (Open)'}
        </p>
      </header>

      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Opening</th>
            <th className="num">Inward</th>
            <th className="num">Sales</th>
            <th className="num">Closing</th>
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row) => (
            <tr key={row.itemName}>
              <td>{row.itemName}</td>
              <td className="num">{formatWeight(row.openingWeight)}</td>
              <td className="num stock-qty in">{formatWeight(row.autoPurchaseIn)}</td>
              <td className="num dashboard-metal-sold">{formatWeight(row.effectiveSales)}</td>
              <td className="num">{formatWeight(row.closingWeight)}</td>
            </tr>
          ))}
          <tr>
            <td>
              <strong>Total</strong>
            </td>
            <td className="num">
              <strong>{formatWeight(totals.opening)}</strong>
            </td>
            <td className="num stock-qty in">
              <strong>{formatWeight(totals.inward)}</strong>
            </td>
            <td className="num dashboard-metal-sold">
              <strong>{formatWeight(totals.sales)}</strong>
            </td>
            <td className="num">
              <strong>{formatWeight(totals.closing)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {sheet.pieceRows.length > 0 ? (
        <>
          <h2>Piece movements (In / Out / Net)</h2>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">In</th>
                <th className="num">Out</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {sheet.pieceRows.map((row) => (
                <tr key={row.productId}>
                  <td>{row.productName}</td>
                  <td className="num">{row.qtyIn}</td>
                  <td className="num">{row.qtyOut}</td>
                  <td className="num">{row.netQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {sheet.note ? <p>Note: {sheet.note}</p> : null}
    </div>
  )
}
