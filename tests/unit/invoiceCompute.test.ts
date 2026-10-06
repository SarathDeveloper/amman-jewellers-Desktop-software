import { describe, expect, it } from 'vitest'
import { computeInvoiceLines } from '../../server/billing/invoiceCompute'

describe('computeInvoiceLines', () => {
  it('prices a manual sale line without a product', () => {
    const [line] = computeInvoiceLines(
      [
        {
          productId: null,
          qty: 1,
          rate: 10000,
          metalRate: 10000,
          grossWeight: 2,
          netWeight: 2,
          stoneWeight: 0,
          makingCharges: 0,
          wastagePct: 0,
          stoneRate: 0,
          otherCharges: 0,
          lineKind: 'sale',
          description: 'Gold chain',
        },
      ],
      new Map(),
      null,
    )
    expect(line.productId).toBeNull()
    expect(line.description).toBe('Gold chain')
    expect(line.lineTotal).toBe(20000)
  })
})
