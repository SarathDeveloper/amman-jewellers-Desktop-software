import type { Invoice } from '@shared/types'

export function oldGoldPrintLines(invoice: Invoice): Array<{
  particulars: string
  weight: number
  amount: number
}> {
  const fromLinks = (invoice.oldGoldLinks ?? []).map((link) => ({
    particulars: link.customerName
      ? `Old gold ${link.purchaseNo} · ${link.customerName}`
      : `Old gold ${link.purchaseNo}`,
    weight: link.netWeight,
    amount: link.amountApplied,
  }))

  const storedOldGold = invoice.oldGold ?? []
  const fromStored = storedOldGold.map((item) => ({
    particulars: item.description || 'Old gold exchange',
    weight: item.netWeight,
    amount: item.finalValue,
  }))

  if (fromLinks.length > 0 || fromStored.length > 0) {
    return [...fromLinks, ...fromStored]
  }

  return invoice.items
    .filter((item) => item.lineKind === 'exchange')
    .map((item) => ({
      particulars: item.description || item.productName || 'Old gold / exchange',
      weight: item.netWeight * item.qty,
      amount: Math.abs(item.lineTotal),
    }))
}
