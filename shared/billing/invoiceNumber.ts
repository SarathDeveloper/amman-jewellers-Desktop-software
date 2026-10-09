/**
 * Draft and estimate bills carry a provisional number until they are finalized.
 * Only a finalized bill gets a real CB-/TI- number.
 */
export function isProvisionalInvoiceNo(invoiceNo: string): boolean {
  const value = invoiceNo.trim().toUpperCase()
  return value.startsWith('DRAFT-') || value.startsWith('EST-')
}

export function isEstimateInvoiceNo(invoiceNo: string): boolean {
  return invoiceNo.trim().toUpperCase().startsWith('EST-')
}

export function isDraftInvoiceNo(invoiceNo: string): boolean {
  return invoiceNo.trim().toUpperCase().startsWith('DRAFT-')
}

/** The label to show instead of the raw provisional number. */
export function invoiceNoLabel(invoiceNo: string, isEstimate: boolean): string | null {
  if (isEstimate || isEstimateInvoiceNo(invoiceNo)) return 'Estimate'
  if (isDraftInvoiceNo(invoiceNo)) return 'Draft'
  return null
}

/** Diagonal stamp drawn across a bill that is not a final, real sale. */
export function invoicePrintWatermark(invoice: {
  status: string
  isEstimate?: boolean
  invoiceNo?: string
}): 'DRAFT' | 'ESTIMATE' | 'CANCELLED' | null {
  if (invoice.status === 'cancelled') return 'CANCELLED'
  if (invoice.status !== 'draft') return null
  return invoice.isEstimate || isEstimateInvoiceNo(invoice.invoiceNo ?? '') ? 'ESTIMATE' : 'DRAFT'
}
