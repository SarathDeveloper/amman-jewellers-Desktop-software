import type { BillFormat } from '@shared/types'
import { printPath } from '../../lib/api'
import type { SaleBillingType } from './billingType'

export function billFormatFromBillingType(billingType: SaleBillingType): BillFormat {
  return billingType === 'tax_invoice' ? 'tax_invoice' : 'cash_bill'
}

export function billPrintPath(invoiceId: number, format: BillFormat): string {
  return printPath(invoiceId, format)
}

export function billPrintPathForType(invoiceId: number, billingType: SaleBillingType): string {
  return printPath(invoiceId, billFormatFromBillingType(billingType))
}
