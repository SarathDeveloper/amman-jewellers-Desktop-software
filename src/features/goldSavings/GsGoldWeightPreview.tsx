import { goldWeightFromAmount } from '@shared/goldSavings/math'
import { formatCurrency, formatWeight } from '../../lib/format'

export function GsGoldWeightPreview({ amount, rate }: { amount: number; rate: number }) {
  const weight = amount > 0 && rate > 0 ? goldWeightFromAmount(amount, rate) : 0
  return (
    <div className="gs-weight-preview">
      <span className="stat-card-label">Gold weight credited</span>
      <strong className="stat-card-value num tone-brand">{formatWeight(weight, 3)}</strong>
      <span className="muted">
        {amount > 0 && rate > 0
          ? `${formatCurrency(amount)} ÷ ${formatCurrency(rate)} per g`
          : 'Enter amount and rate'}
      </span>
    </div>
  )
}
