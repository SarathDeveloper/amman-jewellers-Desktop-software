import { formatCurrency } from '../lib/format'

export function CurrencyDisplay({
  amount,
  tone,
}: {
  amount: number
  tone?: 'danger' | 'success'
}) {
  const className = tone === 'danger' ? 'due-amount' : tone === 'success' ? 'paid-amount' : undefined
  return <span className={`num ${className ?? ''}`.trim()}>{formatCurrency(amount)}</span>
}
