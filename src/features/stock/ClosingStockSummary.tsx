import type { ItemStockRow, MetalDayClosingStatus } from '@shared/types'
import type { StockMetal } from '@shared/itemTypes'
import { sumMetalStock } from '../dashboard/dashboardStats'
import { formatDisplayDate, formatWeight } from '../../lib/format'

export type ClosingSummaryMode = 'transacted' | 'all'

export function hasMovement(row: ItemStockRow): boolean {
  return row.autoPurchaseIn !== 0 || row.effectiveSales !== 0
}

export function filterClosingRows(rows: ItemStockRow[], mode: ClosingSummaryMode): ItemStockRow[] {
  return mode === 'all' ? rows : rows.filter(hasMovement)
}

export function parseClosingSummaryMode(value: string | null | undefined): ClosingSummaryMode {
  return value === 'transacted' ? 'transacted' : 'all'
}

type ClosingMetalBlockProps = {
  metal: StockMetal
  date: string
  rows: ItemStockRow[]
  status: MetalDayClosingStatus
  mode: ClosingSummaryMode
}

export function ClosingMetalBlock({ metal, date, rows, status, mode }: ClosingMetalBlockProps) {
  const displayed = filterClosingRows(rows, mode)
  const full = sumMetalStock(rows)
  const subtotal = sumMetalStock(displayed)
  const displayDate = formatDisplayDate(date)
  const categoryCount = rows.length
  const categoryLabel = categoryCount === 1 ? 'category' : 'categories'

  return (
    <section className="stock-closing-metal">
      <div className="stock-closing-metal-head">
        <h2>{metal}</h2>
        <span className={`badge ${status === 'closed' ? 'final' : 'draft'}`}>
          {status === 'closed' ? 'Closed' : 'Open'}
        </span>
      </div>
      {displayed.length === 0 ? (
        <p className="muted stock-closing-empty">
          {mode === 'transacted'
            ? `No inward or sales movement for ${metal} on ${displayDate}.`
            : `No ${metal} categories on ${displayDate}.`}
        </p>
      ) : (
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
            {displayed.map((row) => (
              <tr key={row.itemName}>
                <td>{row.itemName}</td>
                <td className="num">{formatWeight(row.openingWeight)}</td>
                <td className="num stock-qty in">{formatWeight(row.autoPurchaseIn)}</td>
                <td className="num dashboard-metal-sold">{formatWeight(row.effectiveSales)}</td>
                <td className="num">{formatWeight(row.closingWeight)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num">{formatWeight(subtotal.opening)}</td>
              <td className="num stock-qty in">{formatWeight(subtotal.inward)}</td>
              <td className="num dashboard-metal-sold">{formatWeight(subtotal.sold)}</td>
              <td className="num">{formatWeight(subtotal.closing)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      {mode === 'transacted' && categoryCount > 0 ? (
        <p className="muted stock-closing-note">
          Full {metal} closing: {formatWeight(full.closing)} across {categoryCount} {categoryLabel}
        </p>
      ) : null}
    </section>
  )
}

type ClosingStockSummaryProps = {
  date: string
  goldRows: ItemStockRow[]
  silverRows: ItemStockRow[]
  goldStatus: MetalDayClosingStatus
  silverStatus: MetalDayClosingStatus
  mode: ClosingSummaryMode
}

export function ClosingStockSummary({
  date,
  goldRows,
  silverRows,
  goldStatus,
  silverStatus,
  mode,
}: ClosingStockSummaryProps) {
  const sections: Array<{ metal: StockMetal; rows: ItemStockRow[]; status: MetalDayClosingStatus }> = [
    { metal: 'Gold', rows: goldRows, status: goldStatus },
    { metal: 'Silver', rows: silverRows, status: silverStatus },
  ]

  return (
    <div className="card table-wrap">
      <div className="stock-closing-summary">
        {sections.map((section) => (
          <ClosingMetalBlock
            key={section.metal}
            metal={section.metal}
            date={date}
            rows={section.rows}
            status={section.status}
            mode={mode}
          />
        ))}
      </div>
    </div>
  )
}
