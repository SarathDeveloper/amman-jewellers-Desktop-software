import type { BillFormat } from '@shared/types'
import { printPath } from '../../lib/api'

export type SamplePrintKind = 'cash' | 'tax' | 'adagu'

export function withEmbedFlag(path: string): string {
  const url = new URL(path, 'http://print.local')
  url.searchParams.set('embed', '1')
  return `${url.pathname}${url.search}${url.hash}`
}

export const printPreviewPaths = {
  invoice: (invoiceId: number, format: BillFormat) => printPath(invoiceId, format),
  cashBill: (invoiceId: number) => `/print/cash-bill/${invoiceId}`,
  taxInvoice: (invoiceId: number) => `/print/tax-invoice/${invoiceId}`,
  pledge: (pledgeId: number) => `/print/pledge/${pledgeId}`,
  pledgeRelease: (pledgeId: number) => `/print/pledge-release/${pledgeId}`,
  purchase: (inwardId: number) => `/print/purchase/${inwardId}`,
  metalDay: (date: string, metal: string) => `/print/metal-day/${date}/${metal}`,
  stockClosing: (date: string, mode: string) => `/print/stock-closing/${date}?mode=${encodeURIComponent(mode)}`,
  sample: (kind: SamplePrintKind) => `/print/sample/${kind}`,
  gsPassbook: (accountId: number) => `/print/gs-passbook/${accountId}`,
}
