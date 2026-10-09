import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, ipc, useIntegrationEnv, withHuids } from './helpers/testEnv'

describe('unified stock ledger', () => {
  useIntegrationEnv()

  it('does not change weight stock for old-gold exchange lines', async () => {
    const stockDate = '2026-09-24'
    const customer = await ipc<{ id: number }>(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Exchange Customer',
      phone: '9000000030',
      address: 'Salem',
      notes: '',
    })
    const product = await ipc<{ id: number; huids: string[] }>(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Gold chain',
      category: 'Chain',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 10,
      netWeight: 8,
      makingCharges: 0,
      stockQty: 5,
      imagePath: '',
    }))

    await ipc(IPC_CHANNELS.STOCK_UPSERT, {
      stockDate,
      metal: 'Gold',
      itemName: 'Chain',
      openingWeight: 100,
    })

    const invoice = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: stockDate,
      tax: 0,
      autoTax: false,
      items: [
        {
          productId: product.id,
          lineKind: 'sale',
          qty: 1,
          rate: 5000,
          metalRate: 5000,
          netWeight: 8,
          huid: product.huids[0],
        },
        {
          lineKind: 'exchange',
          qty: 1,
          rate: 5000,
          netWeight: 8,
          metal: 'Gold',
          category: 'Chain',
          description: 'Old gold chain',
          metalRate: 5000,
        },
      ],
    })
    await ipc(IPC_CHANNELS.INVOICES_FINALIZE, invoice.id)

    const rows = await ipc<
      Array<{ itemName: string; autoSales: number; autoExchangeIn: number; closingWeight: number }>
    >(IPC_CHANNELS.STOCK_LIST, { stockDate, metal: 'Gold' })
    const chain = rows.find((row) => row.itemName === 'Chain')
    expect(chain?.autoSales).toBe(8)
    expect(chain?.autoExchangeIn).toBe(0)
    expect(chain?.closingWeight).toBe(92)
  })

  it('reconciliation row reads from the same ledger as the weight stock view', async () => {
    const date = '2026-10-02'
    const rows = await ipc<
      Array<{ metal: string; category: string; ledgerClosing: number; unexplained: number }>
    >(IPC_CHANNELS.STOCK_RECONCILIATION, { date })
    for (const row of rows) {
      expect(row.unexplained).toBe(0)
    }
  })
})
