import type { GoldSavingPaymentMode } from '@shared/types'

export function formatGsPaymentMode(mode: GoldSavingPaymentMode | string): string {
  if (mode === 'upi') return 'UPI'
  if (mode === 'bank_transfer') return 'Bank Transfer'
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}

export const GS_PAYMENT_MODES: GoldSavingPaymentMode[] = [
  'cash',
  'upi',
  'card',
  'bank_transfer',
  'other',
]
