import { IndianRupee } from 'lucide-react'
import type { MixedPaymentPart } from '@shared/types'
import { formatCurrency } from '../../lib/format'
import { parseNumericField } from '../../lib/numericField'

const PARTS: Array<MixedPaymentPart['mode']> = ['cash', 'upi', 'card']

function amountFor(parts: MixedPaymentPart[], mode: MixedPaymentPart['mode']): number {
  return parts.find((part) => part.mode === mode)?.amount ?? 0
}

export function MixedPaymentEditor({
  parts,
  amountPayable,
  disabled,
  onChange,
}: {
  parts: MixedPaymentPart[]
  amountPayable: number
  disabled?: boolean
  onChange: (parts: MixedPaymentPart[]) => void
}) {
  const total = parts.reduce((sum, part) => sum + part.amount, 0)
  const over = total - amountPayable > 0.009

  function setAmount(mode: MixedPaymentPart['mode'], raw: string) {
    const parsed = parseNumericField(raw)
    const amount = parsed === '' ? 0 : parsed
    const next = PARTS.map((item) => ({
      mode: item,
      amount: item === mode ? amount : amountFor(parts, item),
    })).filter((item) => item.amount > 0)
    onChange(next)
  }

  return (
    <div className="mixed-payment-editor">
      {PARTS.map((mode) => (
        <div className="adagu-field" key={mode}>
          <label>{mode === 'upi' ? 'UPI' : mode.charAt(0).toUpperCase() + mode.slice(1)}</label>
          <div className="adagu-input-with-icon">
            <IndianRupee size={14} className="input-icon" />
            <input
              type="number"
              step="0.01"
              disabled={disabled}
              value={amountFor(parts, mode) || ''}
              onChange={(event) => setAmount(mode, event.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
      ))}
      <div className={`mixed-payment-total${over ? ' is-error' : ''}`}>
        <span>Mixed total</span>
        <strong>
          {formatCurrency(total)}
          {over ? ' · exceeds payable' : ''}
        </strong>
      </div>
    </div>
  )
}
