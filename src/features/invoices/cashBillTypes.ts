import type { BillPrintWatermark, PaymentMode } from '@shared/types'

export interface BillDiscountLine {
  label: string
  amount: number
}

export interface CashBillLine {
  sno: number
  particulars: string
  netWeight: number
  totalWeight: number
  grossWeight: number
  stoneWeight: number
  metalRate: number
  wastagePct: number
  makingCharges: number
  vamc: number
  stoneRate: number
  amount: number
}

export interface CashBillData {
  invoiceNo: string
  invoiceDate: string
  customerName: string
  customerPhone: string
  customerAddressLines: string[]
  lines: CashBillLine[]
  itemCount: number
  total: number
  discount: number
  discountBreakdown: BillDiscountLine[]
  oldGoldTotal: number
  oldGoldLines: Array<{ particulars: string; weight: number; amount: number }>
  schemeCreditTotal: number
  schemeCreditLines: Array<{ particulars: string; weight: number; amount: number }>
  roundOff: number
  amountPayable: number
  amountPaid: number
  amountInWords: string
  goldRate: number
  silverRate: number
  paymentMode: PaymentMode
  balanceDue: number
  payments: Array<{ date: string; mode: string; amount: number }>
  /** Diagonal stamp on non-final prints; null for a real bill. */
  watermark: BillPrintWatermark | null
}
