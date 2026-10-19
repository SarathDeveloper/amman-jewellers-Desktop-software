import { describe, expect, it } from 'vitest'
import {
  saleDetailPathForFormat,
  salePathForFormat,
} from '../../src/features/invoices/billingType'

describe('sale bill paths', () => {
  it('opens a blank new bill when no id is given', () => {
    expect(salePathForFormat('cash_bill')).toBe('/billing/cash/new')
    expect(salePathForFormat('tax_invoice')).toBe('/billing/tax/new')
  })

  it('links a finalized bill to its detail page', () => {
    expect(saleDetailPathForFormat('cash_bill', 12)).toBe('/billing/cash/12/detail')
    expect(saleDetailPathForFormat('tax_invoice', 3)).toBe('/billing/tax/3/detail')
  })
})
