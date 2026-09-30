import { Plus, Trash2 } from 'lucide-react'
import { computeOldGoldValue } from '@shared/billing/billSummary'
import type { MetalRates } from '@shared/types'
import { formatCurrency } from '../../lib/format'
import { numericFieldToNumber, parseNumericField } from '../../lib/numericField'
import {
  OLD_GOLD_PURITIES,
  newOldGoldRow,
  rateForOldGoldPurity,
  type OldGoldEditorRow,
} from './invoiceEditorHelpers'

function rowValues(row: OldGoldEditorRow) {
  const grossWeight = numericFieldToNumber(row.grossWeight)
  const stoneWeight = numericFieldToNumber(row.stoneWeight)
  const netWeight =
    numericFieldToNumber(row.netWeight) || Math.max(0, grossWeight - stoneWeight)
  return computeOldGoldValue({
    netWeight,
    ratePerGram: numericFieldToNumber(row.ratePerGram),
    deductionPct: numericFieldToNumber(row.deductionPct),
  })
}

export function OldGoldEditor({
  rows,
  metalRates,
  disabled,
  compact,
  layout = 'default',
  title = 'Old Gold / Exchange',
  subtitle = 'Optional credit against this bill',
  emptyHint = 'No old gold on this bill. Add a row if the customer is exchanging metal.',
  addLabel = 'Add Old Gold',
  onChange,
}: {
  rows: OldGoldEditorRow[]
  metalRates: MetalRates | null
  disabled?: boolean
  compact?: boolean
  layout?: 'default' | 'purchase'
  title?: string
  subtitle?: string
  emptyHint?: string
  addLabel?: string
  onChange: (rows: OldGoldEditorRow[]) => void
}) {
  const isPurchase = layout === 'purchase'
  function update(key: string, patch: Partial<OldGoldEditorRow>) {
    onChange(
      rows.map((row) => {
        if (row.key !== key) return row
        const next = { ...row, ...patch }
        if (patch.grossWeight !== undefined || patch.stoneWeight !== undefined) {
          const gross = numericFieldToNumber(next.grossWeight)
          const stone = numericFieldToNumber(next.stoneWeight)
          next.netWeight = Math.max(0, gross - stone) || ''
        }
        return next
      }),
    )
  }

  const oldGoldTotal = rows.reduce((sum, row) => sum + rowValues(row).finalValue, 0)

  return (
    <div className={`adagu-design-card${compact ? ' sale-bill-old-gold' : ''}`}>
      <div className="adagu-card-header">
        <div className="adagu-card-title-group">
          <div className="adagu-card-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Plus size={16} strokeWidth={1.75} />
          </div>
          <div className="adagu-card-titles">
            <h2>{title}</h2>
            {compact ? null : <p>{subtitle}</p>}
          </div>
        </div>
        <button
          type="button"
          className="adagu-btn-add-item"
          disabled={disabled}
          onClick={() => onChange([...rows, newOldGoldRow(metalRates)])}
        >
          <Plus size={14} /> {addLabel}
        </button>
      </div>

      {rows.length === 0 ? (
        compact ? null : (
          <p className="bill-empty-hint">{emptyHint}</p>
        )
      ) : (
        <div className="adagu-jewellery-table-wrap">
          <table className={`adagu-jewellery-table old-gold-table${isPurchase ? ' old-gold-table--purchase' : ''}`}>
            <thead>
              <tr>
                <th className="old-gold-col-desc" title={isPurchase ? 'Item name' : 'Description'}>
                  {isPurchase ? 'Item name' : 'Desc'}
                </th>
                <th className="old-gold-col-num" title="Gross weight">G.W</th>
                <th className="old-gold-col-num" title="Stone / deduction weight">St.Wt</th>
                <th className="old-gold-col-num" title="Net weight">Net</th>
                <th className="old-gold-col-purity" title="Purity">Purity</th>
                <th className="old-gold-col-num" title="Rate per gram">Rate/g</th>
                <th className="old-gold-col-num" title="Deduction %">Ded %</th>
                {isPurchase ? null : (
                  <>
                    <th className="old-gold-col-amount" title="Gross value">G.Val</th>
                    <th className="old-gold-col-amount" title="Deduction">Ded</th>
                  </>
                )}
                <th className="old-gold-col-amount" title={isPurchase ? 'Line amount' : 'Final value'}>
                  {isPurchase ? 'Amount' : 'Final'}
                </th>
                <th className="adagu-col-action">
                  <span className="adagu-sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const values = rowValues(row)
                return (
                  <tr key={row.key}>
                    <td className="old-gold-col-desc">
                      <input
                        disabled={disabled}
                        value={row.description}
                        onChange={(event) => update(row.key, { description: event.target.value })}
                        placeholder={isPurchase ? 'Item name' : 'Old gold'}
                      />
                    </td>
                    <td className="old-gold-col-num">
                      <input
                        type="number"
                        step="0.001"
                        disabled={disabled}
                        value={row.grossWeight}
                        onChange={(event) => update(row.key, { grossWeight: parseNumericField(event.target.value) })}
                      />
                    </td>
                    <td className="old-gold-col-num">
                      <input
                        type="number"
                        step="0.001"
                        disabled={disabled}
                        value={row.stoneWeight}
                        onChange={(event) => update(row.key, { stoneWeight: parseNumericField(event.target.value) })}
                      />
                    </td>
                    <td className="old-gold-col-num">
                      <input
                        type="number"
                        step="0.001"
                        disabled={disabled}
                        value={row.netWeight}
                        onChange={(event) => update(row.key, { netWeight: parseNumericField(event.target.value) })}
                      />
                    </td>
                    <td className="old-gold-col-purity">
                      <select
                        disabled={disabled}
                        value={OLD_GOLD_PURITIES.includes(row.purity as (typeof OLD_GOLD_PURITIES)[number]) ? row.purity : '22K'}
                        onChange={(event) => {
                          const purity = event.target.value
                          update(row.key, { purity, ratePerGram: rateForOldGoldPurity(purity, metalRates) || '' })
                        }}
                      >
                        {OLD_GOLD_PURITIES.map((purity) => (
                          <option key={purity} value={purity}>
                            {purity}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="old-gold-col-num">
                      <input
                        type="number"
                        step="0.01"
                        disabled={disabled}
                        value={row.ratePerGram}
                        onChange={(event) => update(row.key, { ratePerGram: parseNumericField(event.target.value) })}
                      />
                    </td>
                    <td className="old-gold-col-num">
                      <input
                        type="number"
                        step="0.01"
                        disabled={disabled}
                        value={row.deductionPct}
                        onChange={(event) => update(row.key, { deductionPct: parseNumericField(event.target.value) })}
                      />
                    </td>
                    {isPurchase ? null : (
                      <>
                        <td className="old-gold-col-amount num">{formatCurrency(values.grossValue)}</td>
                        <td className="old-gold-col-amount num">{formatCurrency(values.deductionAmount)}</td>
                      </>
                    )}
                    <td className="old-gold-col-amount num">{formatCurrency(values.finalValue)}</td>
                    <td className="adagu-col-action">
                      <button
                        type="button"
                        className="adagu-action-btn-red"
                        disabled={disabled}
                        onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="old-gold-total">
        <span>Old gold total</span>
        <strong>{formatCurrency(oldGoldTotal)}</strong>
      </div>
    </div>
  )
}
