import type { PledgePaymentMode } from '@shared/types'

export const PLEDGE_PAYMENT_MODES: { value: PledgePaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'auction', label: 'Auction' },
]

export function pledgePaymentModeLabel(mode: PledgePaymentMode): string {
  return PLEDGE_PAYMENT_MODES.find((option) => option.value === mode)?.label ?? mode
}
