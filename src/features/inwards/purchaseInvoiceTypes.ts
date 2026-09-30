import type { PurchasePaymentMode } from '@shared/types'

export interface PurchaseInvoiceLine {
  sno: number
  item: string
  hsnCode: string
  purity: string
  grossWeight: number
  netWeight: number
  rate: number
  makingCharges: number
  amount: number
}

export interface PurchaseInvoiceData {
  invoiceNo: string
  invoiceDate: string
  supplierName: string
  supplierGstin: string
  supplierPhone: string
  supplierAddressLines: string[]
  lines: PurchaseInvoiceLine[]
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  roundOff: number
  total: number
  amountInWords: string
  paymentMode: PurchasePaymentMode
  notes: string
}
