import { amountInWords } from '@shared/billing/amountInWords'
import type { Inward, InwardItem } from '@shared/types'
import { formatDisplayDate } from '../../lib/format'
import type { PurchaseInvoiceData, PurchaseInvoiceLine } from './purchaseInvoiceTypes'

export function purchaseItemName(item: InwardItem): string {
  const name = item.productName?.trim()
  if (name) return name
  return item.category
}

export function purchaseGrossWeight(item: InwardItem): number {
  return item.grossWeight > 0 ? item.grossWeight : item.netWeight
}

function splitAddress(address: string): string[] {
  const trimmed = address.trim()
  if (!trimmed) return []
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function buildPurchaseInvoiceData(inward: Inward): PurchaseInvoiceData {
  const lines: PurchaseInvoiceLine[] = inward.items.map((item, index) => ({
    sno: index + 1,
    item: purchaseItemName(item),
    hsnCode: item.hsnCode || '7113',
    purity: item.purity,
    grossWeight: purchaseGrossWeight(item),
    netWeight: item.netWeight,
    rate: item.rate,
    makingCharges: item.makingCharges,
    amount: item.lineTotal,
  }))

  return {
    invoiceNo: inward.inwardNo,
    invoiceDate: formatDisplayDate(inward.inwardDate),
    supplierName: inward.supplierName,
    supplierGstin: inward.supplierGstin,
    supplierPhone: inward.supplierPhone,
    supplierAddressLines: splitAddress(inward.supplierAddress),
    lines,
    subtotal: inward.subtotal,
    cgst: inward.cgst,
    sgst: inward.sgst,
    igst: inward.igst,
    roundOff: inward.roundOff,
    total: inward.total,
    amountInWords: amountInWords(inward.total),
    paymentMode: inward.paymentMode,
    notes: inward.notes,
    watermark: inward.status === 'draft' ? 'DRAFT' : null,
  }
}
