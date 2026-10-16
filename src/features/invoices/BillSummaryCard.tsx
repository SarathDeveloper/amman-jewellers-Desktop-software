import { useState } from 'react'
import { Calculator, Percent, Scale, ShoppingBag } from 'lucide-react'
import type { BillSummary } from '@shared/billing/billSummary'
import { suggestRoundOff } from '@shared/billing/billSummary'
import { formatCurrency, formatInr, formatWeight } from '../../lib/format'
import { parseNumericField } from '../../lib/numericField'

/** A leading minus or a trailing decimal is still being typed, not a saved round off. */
function isUnfinishedRoundOff(raw: string): boolean {
  return raw === '-' || raw === '.' || raw === '-.' || raw.endsWith('.')
}

export function BillSummaryCard({
  summary,
  jewelleryValue,
  wastageAmount,
  makingCharges,
  hasVa,
  hasMc,
  stoneValue,
  otherCharges,
  itemCount,
  totalGrossWeight,
  showTax,
  disabled,
  discount,
  onDiscountChange,
  onRoundOffChange,
}: {
  summary: BillSummary
  jewelleryValue: number
  wastageAmount: number
  makingCharges: number
  hasVa: boolean
  hasMc: boolean
  stoneValue: number
  otherCharges: number
  itemCount: number
  totalGrossWeight: number
  showTax: boolean
  disabled?: boolean
  discount: number
  onDiscountChange: (value: number) => void
  onRoundOffChange: (value: number) => void
}) {
  const suggested = suggestRoundOff(summary.amountBeforeRoundOff)
  const showDiscount = !disabled || discount > 0
  const showRoundOff = !disabled || summary.roundOff !== 0
  const [roundOffDraft, setRoundOffDraft] = useState<string | null>(null)
  const [roundOffHover, setRoundOffHover] = useState(false)
  const roundOffShown =
    roundOffDraft !== null ? roundOffDraft : summary.roundOff === 0 ? '' : String(summary.roundOff)

  function openRoundOff() {
    if (disabled) return
    if (roundOffDraft !== null) return
    setRoundOffDraft(summary.roundOff === 0 ? '' : String(summary.roundOff))
  }

  function changeRoundOff(raw: string) {
    if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return
    if (raw === '') {
      setRoundOffDraft(raw)
      onRoundOffChange(0)
      return
    }
    if (isUnfinishedRoundOff(raw)) {
      setRoundOffDraft(raw)
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    // A typed positive amount is a reduction. 0.15 becomes −0.15.
    const reduction = parsed > 0 ? -parsed : parsed
    setRoundOffDraft(reduction === parsed ? raw : String(reduction))
    onRoundOffChange(reduction)
  }

  function closeRoundOff() {
    setRoundOffDraft(null)
  }

  return (
    <div className="adagu-design-card sale-bill-summary-card">
      <div className="adagu-card-header">
        <div className="adagu-card-title-group">
          <div className="adagu-card-icon" style={{ background: 'var(--surface-muted)', color: 'var(--text)' }}>
            <Calculator size={16} strokeWidth={1.75} />
          </div>
          <div className="adagu-card-titles">
            <h2>Bill Summary</h2>
          </div>
        </div>
      </div>

      <div className="sale-bill-summary-stats">
        <div className="sale-bill-summary-stat">
          <div className="sale-bill-summary-stat-icon" aria-hidden>
            <ShoppingBag size={16} strokeWidth={1.75} />
          </div>
          <div>
            <span>Total Items</span>
            <strong>{itemCount}</strong>
          </div>
        </div>
        <div className="sale-bill-summary-stat">
          <div className="sale-bill-summary-stat-icon" aria-hidden>
            <Scale size={16} strokeWidth={1.75} />
          </div>
          <div>
            <span>Total Weight</span>
            <strong>{formatWeight(totalGrossWeight, 3)}</strong>
          </div>
        </div>
      </div>

      <div className="adagu-calculated-summary bill-summary">
        <div className="adagu-calculated-list">
          <div className="adagu-calculated-row">
            <span className="label">Total Jewellery Value</span>
            <span className="value">{formatCurrency(jewelleryValue)}</span>
          </div>
          {(hasVa || hasMc) && (
            <div className="adagu-calculated-row">
              <span className="label">VA/MC</span>
              <span className="value">{formatCurrency(wastageAmount + makingCharges)}</span>
            </div>
          )}
          {stoneValue > 0 && (
            <div className="adagu-calculated-row">
              <span className="label">Stone</span>
              <span className="value">{formatCurrency(stoneValue)}</span>
            </div>
          )}
          {otherCharges > 0 && (
            <div className="adagu-calculated-row">
              <span className="label">Other charges</span>
              <span className="value">{formatCurrency(otherCharges)}</span>
            </div>
          )}
          {showTax && (
            <>
              <div className="adagu-calculated-row sale-bill-summary-taxable">
                <span className="label">Taxable Amount</span>
                <span className="value">{formatCurrency(summary.taxable)}</span>
              </div>
              <div className="adagu-calculated-row">
                <span className="label">
                  <Percent size={14} /> CGST 1.5%
                </span>
                <span className="value">{formatCurrency(summary.cgst)}</span>
              </div>
              <div className="adagu-calculated-row">
                <span className="label">
                  <Percent size={14} /> SGST 1.5%
                </span>
                <span className="value">{formatCurrency(summary.sgst)}</span>
              </div>
              <div className="adagu-calculated-row sale-bill-summary-tax-total">
                <span className="label">Total Tax (3%)</span>
                <span className="value">{formatCurrency(summary.tax)}</span>
              </div>
            </>
          )}
          {summary.oldGoldTotal > 0 && (
            <div className="adagu-calculated-row">
              <span className="label">Old gold exchange (−)</span>
              <span className="value">-{formatCurrency(summary.oldGoldTotal)}</span>
            </div>
          )}
          {summary.schemeCreditTotal > 0 && (
            <div className="adagu-calculated-row">
              <span className="label">Gold savings credit (−)</span>
              <span className="value">-{formatCurrency(summary.schemeCreditTotal)}</span>
            </div>
          )}
          {showDiscount && (
            <div className="adagu-calculated-row bill-summary-roundoff sale-bill-summary-adjust">
              <span className="label">Discount</span>
              <span className="value bill-summary-roundoff-input">
                {disabled ? (
                  formatCurrency(discount)
                ) : (
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={discount || ''}
                    onChange={(event) => {
                      const parsed = parseNumericField(event.target.value)
                      onDiscountChange(parsed === '' ? 0 : parsed)
                    }}
                  />
                )}
              </span>
            </div>
          )}
          {showRoundOff && (
            <div className="adagu-calculated-row bill-summary-roundoff sale-bill-summary-adjust">
              <span className="label">Round off</span>
              <span className="value bill-summary-roundoff-input">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={roundOffDraft !== null || roundOffHover ? '' : '0'}
                  disabled={disabled}
                  aria-label="Round off"
                  value={roundOffShown}
                  onMouseEnter={() => setRoundOffHover(true)}
                  onMouseLeave={() => setRoundOffHover(false)}
                  onFocus={openRoundOff}
                  onBlur={closeRoundOff}
                  onChange={(event) => changeRoundOff(event.target.value)}
                />
                {!disabled && suggested !== 0 && suggested !== summary.roundOff ? (
                  <button
                    type="button"
                    className="btn ghost bill-summary-suggest"
                    onClick={() => {
                      setRoundOffDraft(null)
                      onRoundOffChange(suggested)
                    }}
                  >
                    Use −₹{formatInr(Math.abs(suggested), 2)}
                  </button>
                ) : null}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="sale-bill-grand-total">
        <span>Grand Total</span>
        <strong>{formatCurrency(summary.amountPayable)}</strong>
      </div>
    </div>
  )
}
