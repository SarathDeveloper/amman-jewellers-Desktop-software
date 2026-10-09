import type { Invoice } from '@shared/types'

export function schemeCreditPrintLines(invoice: Invoice): Array<{
  particulars: string
  weight: number
  amount: number
}> {
  return (invoice.goldSavingLinks ?? []).map((link) => ({
    particulars: `Gold savings ${link.accountNo}${link.bonusGoldWeight > 0 ? ' (incl. bonus)' : ''}`,
    weight: link.goldWeight + link.bonusGoldWeight,
    amount: link.amountApplied,
  }))
}
