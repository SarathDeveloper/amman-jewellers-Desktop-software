import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { STOCK_METALS, type StockMetal } from '@shared/itemTypes'
import type { ItemStockRow } from '@shared/types'
import { FilterBar } from '../../components/FilterBar'
import { CategoryIcon, formatStockNumber, getCategoryIconClass } from '../stock/categoryIcon'
import { sumMetalStock } from './dashboardStats'

const METAL_OPTIONS = STOCK_METALS.map((metal) => ({ value: metal, label: metal }))

function signedWeight(value: number, sign: '+' | '-'): string {
  if (!value) return formatStockNumber(0)
  return `${sign}${formatStockNumber(Math.abs(value))}`
}

function isZeroRow(row: ItemStockRow): boolean {
  return (
    row.openingWeight === 0 &&
    row.autoPurchaseIn === 0 &&
    row.effectiveSales === 0 &&
    row.closingWeight === 0
  )
}

export function CategoryStockCard({
  goldRows,
  silverRows,
  dateLabel,
}: {
  goldRows: ItemStockRow[]
  silverRows: ItemStockRow[]
  dateLabel: string
}) {
  const [metal, setMetal] = useState<StockMetal>('Gold')
  const navigate = useNavigate()
  const rows = metal === 'Gold' ? goldRows : silverRows
  const totals = sumMetalStock(rows)

  return (
    <section className="card padded dashboard-panel dashboard-category-panel" aria-label="Stock by category">
      <div className="dashboard-category-head">
        <div>
          <h2>Stock by category</h2>
          <p className="muted dashboard-panel-sub">{dateLabel}</p>
        </div>
        <FilterBar value={metal} onChange={setMetal} options={METAL_OPTIONS} />
      </div>

      {rows.length === 0 ? (
        <div className="dashboard-empty-state">
          No categories yet.{' '}
          <Link to="/inventory/stock" className="dashboard-panel-link">
            Add category
          </Link>
        </div>
      ) : (
        <div className="table-wrap dashboard-category-table">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Opening (g)</th>
                <th className="num">Inward (g)</th>
                <th className="num">Sales (g)</th>
                <th className="num">Closing (g)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.itemName}
                  className={isZeroRow(row) ? 'dashboard-category-row-zero' : undefined}
                  tabIndex={0}
                  onClick={() => navigate('/inventory/stock')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      navigate('/inventory/stock')
                    }
                  }}
                >
                  <td>
                    <span className="stock-category-name">
                      <span
                        className={`stock-category-icon ${getCategoryIconClass(row.itemName)}`}
                        aria-hidden
                      >
                        <CategoryIcon name={row.itemName} />
                      </span>
                      {row.itemName}
                    </span>
                  </td>
                  <td className="num">{formatStockNumber(row.openingWeight)}</td>
                  <td className="num stock-qty in">{signedWeight(row.autoPurchaseIn, '+')}</td>
                  <td className="num dashboard-metal-sold">{signedWeight(row.effectiveSales, '-')}</td>
                  <td className="num">{formatStockNumber(row.closingWeight)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{formatStockNumber(totals.opening)}</td>
                <td className="num stock-qty in">{signedWeight(totals.inward, '+')}</td>
                <td className="num dashboard-metal-sold">{signedWeight(totals.sold, '-')}</td>
                <td className="num">{formatStockNumber(totals.closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="dashboard-category-footer">
        <Link to="/inventory/stock" className="dashboard-panel-link">
          View stock
        </Link>
      </div>
    </section>
  )
}
