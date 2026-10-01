import { describe, expect, it } from 'vitest'
import type { ReportDefinition, ReportResult } from '@shared/reportsCatalog'
import { IPC_CHANNELS, invokeIpcForTests, ipc, useIntegrationEnv, withHuids } from './helpers/testEnv'

const UNAVAILABLE = [
  'adagu-sales',
  'sales-return',
  'purchase-return',
  'variant-size-stock',
  'gross-profit',
]

describe('reports', () => {
  useIntegrationEnv()

  it('marks reports that need missing documents as unavailable', async () => {
    const catalog = await ipc<ReportDefinition[]>(IPC_CHANNELS.REPORTS_CATALOG)
    for (const id of UNAVAILABLE) {
      const report = catalog.find((item) => item.id === id)
      expect(report?.available).toBe(false)
      expect(report?.unavailableReason).toBeTruthy()
    }
    expect(catalog.filter((item) => item.available).length).toBeGreaterThan(0)
  })

  it('includes a finalized cash bill in daily sales and leaves it out of tax invoice sales', async () => {
    const customer = await ipc<{ id: number }>(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Buyer',
      phone: '9876543210',
      address: 'Salem',
      notes: '',
    })
    const product = await ipc<{ id: number }>(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Chain item',
      category: 'Chain',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 10,
      netWeight: 2,
      makingCharges: 0,
      stockQty: 3,
      imagePath: '',
    }))
    const invoiceDate = '2026-09-24'
    const draft = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      billFormat: 'cash_bill',
      items: [{ productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2 }],
    })
    const finalized = await ipc<{ amountPayable: number; invoiceNo: string }>(
      IPC_CHANNELS.INVOICES_FINALIZE,
      draft.id,
    )

    const daily = await ipc<ReportResult>(IPC_CHANNELS.REPORTS_RUN, {
      id: 'daily-sales',
      from: invoiceDate,
      to: invoiceDate,
    })
    expect(daily.rows).toHaveLength(1)
    expect(daily.rows[0]?.date).toBe(invoiceDate)
    expect(daily.totals.payable).toBe(finalized.amountPayable)

    const cash = await ipc<ReportResult>(IPC_CHANNELS.REPORTS_RUN, {
      id: 'cash-sales',
      from: invoiceDate,
      to: invoiceDate,
    })
    expect(cash.rows.map((row) => row.invoiceNo)).toContain(finalized.invoiceNo)

    const tax = await ipc<ReportResult>(IPC_CHANNELS.REPORTS_RUN, {
      id: 'tax-invoice-sales',
      from: invoiceDate,
      to: invoiceDate,
    })
    expect(tax.rows).toHaveLength(0)
  })

  it('rejects an unavailable report and runs every available report', async () => {
    const denied = await invokeIpcForTests(IPC_CHANNELS.REPORTS_RUN, {
      id: 'gross-profit',
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(denied.ok).toBe(false)

    const catalog = await ipc<ReportDefinition[]>(IPC_CHANNELS.REPORTS_CATALOG)
    const failures: string[] = []
    for (const report of catalog.filter((item) => item.available)) {
      const result = await invokeIpcForTests<ReportResult>(IPC_CHANNELS.REPORTS_RUN, {
        id: report.id,
        from: '2026-09-01',
        to: '2026-09-30',
      })
      if (!result.ok) {
        failures.push(`${report.id}: ${result.error}`)
        continue
      }
      if (result.data.columns.length === 0) {
        failures.push(`${report.id}: no columns`)
      }
    }
    expect(failures).toEqual([])
  })
})
