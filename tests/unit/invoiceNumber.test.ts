import { describe, expect, it } from 'vitest'
import {
  invoiceNoLabel,
  invoicePrintWatermark,
  isDraftInvoiceNo,
  isEstimateInvoiceNo,
  isProvisionalInvoiceNo,
} from '../../shared/billing/invoiceNumber'

describe('invoice number helpers', () => {
  it('detects provisional draft and estimate numbers', () => {
    expect(isProvisionalInvoiceNo('DRAFT-12')).toBe(true)
    expect(isProvisionalInvoiceNo('est-2026-0003')).toBe(true)
    expect(isProvisionalInvoiceNo('CB-2026-0001')).toBe(false)
    expect(isProvisionalInvoiceNo('TI-2026-0001')).toBe(false)
  })

  it('separates draft from estimate', () => {
    expect(isDraftInvoiceNo('DRAFT-1')).toBe(true)
    expect(isDraftInvoiceNo('EST-2026-0001')).toBe(false)
    expect(isEstimateInvoiceNo('EST-2026-0001')).toBe(true)
    expect(isEstimateInvoiceNo('DRAFT-1')).toBe(false)
  })

  it('labels only provisional numbers', () => {
    expect(invoiceNoLabel('DRAFT-5', false)).toBe('Draft')
    expect(invoiceNoLabel('EST-2026-0005', false)).toBe('Estimate')
    expect(invoiceNoLabel('CB-2026-0005', true)).toBe('Estimate')
    expect(invoiceNoLabel('CB-2026-0005', false)).toBeNull()
    expect(invoiceNoLabel('TI-2026-0005', false)).toBeNull()
  })

  it('stamps drafts, estimates and cancelled bills only', () => {
    expect(invoicePrintWatermark({ status: 'final', invoiceNo: 'CB-2026-0001' })).toBeNull()
    expect(invoicePrintWatermark({ status: 'draft', invoiceNo: 'DRAFT-9' })).toBe('DRAFT')
    expect(invoicePrintWatermark({ status: 'draft', invoiceNo: 'CB-2026-0009' })).toBe('DRAFT')
    expect(
      invoicePrintWatermark({ status: 'draft', isEstimate: true, invoiceNo: 'EST-2026-0002' }),
    ).toBe('ESTIMATE')
    expect(invoicePrintWatermark({ status: 'cancelled', invoiceNo: 'CB-2026-0002' })).toBe(
      'CANCELLED',
    )
  })
})
