import { amountInWords } from '@shared/billing/amountInWords'
import { invoicePrintWatermark } from '@shared/billing/invoiceNumber'
import type { BillCustomerInfo, Invoice, MetalRates } from '@shared/types'
import type { BillDiscountLine, CashBillData } from './cashBillTypes'
import { oldGoldPrintLines } from './oldGoldPrintLines'
import { schemeCreditPrintLines } from './schemeCreditPrintLines'

function splitAddress(address: string | undefined): string[] {
  const trimmed = address?.trim() ?? ''
  if (!trimmed) return []
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function discountBreakdown(invoice: Invoice): BillDiscountLine[] {
  if (invoice.discount <= 0) return []
  return [{ label: 'Discount', amount: invoice.discount }]
}

export function buildCashBillData(
  invoice: Invoice,
  extras?: { customer?: BillCustomerInfo; rates?: MetalRates | null },
): CashBillData {
  const saleItems =
    invoice.items.filter((item) => item.lineKind !== 'exchange').length > 0
      ? invoice.items.filter((item) => item.lineKind !== 'exchange')
      : invoice.items
  const sourceItems =
    saleItems.length > 0
      ? saleItems
      : [
          {
            productName: 'Old bill',
            qty: 1,
            netWeight: invoice.summaryGoldG + invoice.summarySilverG,
            grossWeight: invoice.summaryGoldG + invoice.summarySilverG,
            stoneWeight: 0,
            metalRate: 0,
            wastagePct: 0,
            makingCharges: invoice.summaryMaking,
            stoneRate: 0,
            lineTotal: invoice.subtotal,
            lineKind: 'sale' as const,
            description: '',
            purity: '',
            huid: '',
          },
        ]
  const oldGoldLines = oldGoldPrintLines(invoice)
  const schemeCreditLines = schemeCreditPrintLines(invoice)
  const amountPayable = invoice.amountPayable ?? invoice.total
  const itemCount = sourceItems.reduce((sum, item) => sum + (item.qty || 1), 0)

  return {
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    customerName: extras?.customer?.name || invoice.customerName,
    customerPhone: extras?.customer?.phone || invoice.customerPhone || '',
    customerAddressLines: splitAddress(extras?.customer?.address),
    itemCount,
    total: invoice.total,
    discount: invoice.discount,
    discountBreakdown: discountBreakdown(invoice),
    oldGoldTotal: oldGoldLines.reduce((sum, item) => sum + item.amount, 0),
    oldGoldLines,
    schemeCreditTotal: schemeCreditLines.reduce((sum, item) => sum + item.amount, 0),
    schemeCreditLines,
    roundOff: invoice.roundOff ?? 0,
    amountPayable,
    amountPaid: invoice.amountPaid,
    amountInWords: amountInWords(amountPayable),
    goldRate: extras?.rates?.gold22k ?? 0,
    silverRate: extras?.rates?.silverFine ?? 0,
    paymentMode: invoice.paymentMode,
    balanceDue: invoice.balanceDue,
    payments: (invoice.payments ?? []).map((payment) => ({
      date: payment.date,
      mode: payment.mode,
      amount: payment.amount,
    })),
    watermark: invoicePrintWatermark(invoice),
    lines: sourceItems.map((item, index) => {
      const name = item.productName
      const qty = item.qty || 1
      const huid = (item.huid ?? '').trim().toUpperCase()
      const purity = (item.purity ?? '').trim()
      const baseParticulars = qty > 1 ? `${name} × ${qty}` : name
      const withPurity = purity ? `${baseParticulars} (${purity})` : baseParticulars
      const particulars = huid ? `${withPurity} · HUID ${huid}` : withPurity
      const netWeight = item.netWeight * qty
      const stoneWeight = (item.stoneWeight || 0) * qty
      const grossWeight = (item.grossWeight || item.netWeight) * qty
      const makingCharges = (item.makingCharges || 0) * qty

      return {
        sno: index + 1,
        particulars,
        netWeight,
        totalWeight: netWeight > 0 ? netWeight : grossWeight > 0 ? grossWeight : netWeight + stoneWeight,
        grossWeight,
        stoneWeight,
        metalRate: item.metalRate || 0,
        wastagePct: item.wastagePct || 0,
        makingCharges,
        vamc: (item.wastagePct || 0) > 0 ? item.wastagePct || 0 : makingCharges,
        stoneRate: item.stoneRate || 0,
        amount: item.lineTotal,
      }
    }),
  }
}
