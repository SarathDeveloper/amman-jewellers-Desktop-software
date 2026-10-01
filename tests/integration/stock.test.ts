import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, ipc, useIntegrationEnv, withHuids } from './helpers/testEnv'

describe('stock IPC', () => {
  useIntegrationEnv()

  it('lists the seeded stock categories from the database', async () => {
    const rows = await ipc<Array<{ itemName: string }>>(IPC_CHANNELS.STOCK_LIST, {
      stockDate: '2026-09-24',
      metal: 'Gold',
    })
    expect(rows.map((row) => row.itemName)).toEqual([
      'Chain',
      'Necklace',
      'Haram',
      'Bangle',
      'Ring',
      'Stud',
      'Mattal',
      'Nosepin',
      'Thali',
      'Gundu',
      'L. Coin',
      'P. Coin',
      'Nanal',
      'Backchain',
      'D Studs',
    ])
  })

  it('tracks opening weight and auto sales from finalized invoices', async () => {
    const stockDate = '2026-09-24'
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Stock Customer',
      phone: '9000000020',
      address: 'Salem',
      notes: '',
    })
    const product = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Gold chain',
      category: 'Chain',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 10,
      netWeight: 3.5,
      makingCharges: 0,
      stockQty: 10,
      imagePath: '',
    }))

    await ipc(IPC_CHANNELS.STOCK_UPSERT, {
      stockDate,
      metal: 'Gold',
      itemName: 'Chain',
      openingWeight: 100,
    })

    const beforeInvoice = await ipc(IPC_CHANNELS.STOCK_LIST, { stockDate, metal: 'Gold' })
    const chainBefore = beforeInvoice.find((row) => row.itemName === 'Chain')
    expect(chainBefore?.autoSales).toBe(0)
    expect(chainBefore?.closingWeight).toBe(100)

    const invoice = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: stockDate,
      tax: 0,
      items: [{ productId: product.id, qty: 2, rate: 100 }],
    })
    await ipc(IPC_CHANNELS.INVOICES_FINALIZE, invoice.id)

    const afterInvoice = await ipc(IPC_CHANNELS.STOCK_LIST, { stockDate, metal: 'Gold' })
    const chainAfter = afterInvoice.find((row) => row.itemName === 'Chain')
    expect(chainAfter?.autoSales).toBe(7)
    expect(chainAfter?.effectiveSales).toBe(7)
    expect(chainAfter?.closingWeight).toBe(93)
  })

  it('uses billed line weight and category after the product catalog changes', async () => {
    const stockDate = '2026-09-24'
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Snapshot Customer',
      phone: '9000000021',
      address: 'Salem',
      notes: '',
    })
    const product = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Gold chain',
      category: 'Chain',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 10,
      netWeight: 3,
      makingCharges: 0,
      stockQty: 10,
      imagePath: '',
    }))

    const invoice = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: stockDate,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 6 }],
    })
    await ipc(IPC_CHANNELS.INVOICES_FINALIZE, invoice.id)

    await ipc(IPC_CHANNELS.PRODUCTS_UPDATE, {
      id: product.id,
      input: withHuids({
        name: 'Gold chain',
        category: 'Ring',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 10,
        netWeight: 9,
        makingCharges: 0,
        stockQty: 9,
        imagePath: '',
      }),
    })

    const rows = await ipc(IPC_CHANNELS.STOCK_LIST, { stockDate, metal: 'Gold' })
    const chainRow = rows.find((row) => row.itemName === 'Chain')
    const ringRow = rows.find((row) => row.itemName === 'Ring')
    expect(chainRow?.autoSales).toBe(6)
    expect(ringRow?.autoSales).toBe(0)
  })

  it('creates, renames, and deletes a stock category', async () => {
    const stockDate = '2026-09-24'
    const created = await ipc<{ name: string }>(IPC_CHANNELS.STOCK_CREATE_CATEGORY, {
      name: 'Bracelet',
      stockDate,
      metal: 'Gold',
      openingWeight: 12,
    })
    expect(created.name).toBe('Bracelet')

    const afterCreate = await ipc<Array<{ itemName: string; openingWeight: number }>>(
      IPC_CHANNELS.STOCK_LIST,
      { stockDate, metal: 'Gold' },
    )
    expect(afterCreate.some((row) => row.itemName === 'Bracelet')).toBe(true)
    expect(afterCreate.find((row) => row.itemName === 'Bracelet')?.openingWeight).toBe(12)

    await ipc(IPC_CHANNELS.STOCK_UPDATE_CATEGORY, {
      currentName: 'Bracelet',
      newName: 'Kada',
    })
    const afterRename = await ipc<Array<{ itemName: string }>>(IPC_CHANNELS.STOCK_LIST, {
      stockDate,
      metal: 'Gold',
    })
    expect(afterRename.some((row) => row.itemName === 'Kada')).toBe(true)
    expect(afterRename.some((row) => row.itemName === 'Bracelet')).toBe(false)

    await ipc(IPC_CHANNELS.STOCK_DELETE_CATEGORY, { name: 'Kada' })
    const afterDelete = await ipc<Array<{ itemName: string }>>(IPC_CHANNELS.STOCK_LIST, {
      stockDate,
      metal: 'Gold',
    })
    expect(afterDelete.some((row) => row.itemName === 'Kada')).toBe(false)
  })

  it('clears sales overrides and lists history for a saved date', async () => {
    const stockDate = '2026-09-20'
    await ipc(IPC_CHANNELS.STOCK_UPSERT, {
      stockDate,
      metal: 'Gold',
      itemName: 'Chain',
      openingWeight: 80,
      salesOverride: 10,
      overrideReason: 'Manual correction of billed weight',
    })

    const before = await ipc<Array<{ itemName: string; salesOverride: number | null; effectiveSales: number }>>(
      IPC_CHANNELS.STOCK_LIST,
      { stockDate, metal: 'Gold' },
    )
    expect(before.find((row) => row.itemName === 'Chain')?.salesOverride).toBe(10)

    const cleared = await ipc<Array<{ itemName: string; salesOverride: number | null }>>(
      IPC_CHANNELS.STOCK_CLEAR_OVERRIDES,
      { stockDate, metal: 'Gold' },
    )
    expect(cleared.find((row) => row.itemName === 'Chain')?.salesOverride).toBeNull()

    const history = await ipc<Array<{ stockDate: string; openingWeight: number }>>(
      IPC_CHANNELS.STOCK_HISTORY,
      { metal: 'Gold' },
    )
    expect(history.some((row) => row.stockDate === stockDate)).toBe(true)
    expect(history.find((row) => row.stockDate === stockDate)?.openingWeight).toBe(80)
  })

  it('cascades category rename to products and blocks delete when in use', async () => {
    const product = await ipc<{ id: number; category: string }>(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Temple ring',
      category: 'Ring',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 4,
      netWeight: 3.5,
      makingCharges: 0,
      stockQty: 1,
      imagePath: '',
    }))
    expect(product.category).toBe('Ring')

    await ipc(IPC_CHANNELS.STOCK_UPDATE_CATEGORY, {
      currentName: 'Ring',
      newName: 'Rings',
    })
    const renamed = await ipc<{ category: string }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(renamed.category).toBe('Rings')

    await expect(ipc(IPC_CHANNELS.STOCK_DELETE_CATEGORY, { name: 'Rings' })).rejects.toThrow(
      /in use/i,
    )

    const categories = await ipc<Array<{ name: string }>>(IPC_CHANNELS.STOCK_CATEGORIES_LIST)
    expect(categories.some((row) => row.name === 'Rings')).toBe(true)
  })

  it('rejects a product in a category that does not exist', async () => {
    await expect(
      ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
        name: 'Unknown item',
        category: 'DoesNotExist',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 1,
        netWeight: 1,
        makingCharges: 0,
        stockQty: 1,
        imagePath: '',
      })),
    ).rejects.toThrow(/Category does not exist/)
  })

  it('returns a reconciliation row for each metal and category', async () => {
    const rows = await ipc<
      Array<{ metal: string; category: string; flagged: boolean; unexplained: number }>
    >(IPC_CHANNELS.STOCK_RECONCILIATION, { date: '2026-09-24' })
    expect(rows.some((row) => row.metal === 'Gold' && row.category === 'Chain')).toBe(true)
    expect(rows.some((row) => row.metal === 'Silver' && row.category === 'Chain')).toBe(true)
  })
})
