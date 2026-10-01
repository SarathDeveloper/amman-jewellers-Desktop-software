import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, ipc, invokeIpcForTests, useIntegrationEnv, withHuids } from './helpers/testEnv'

async function seedCustomerAndProduct() {
  const customer = await ipc<{ id: number }>(IPC_CHANNELS.CUSTOMERS_CREATE, {
    name: 'Buyer',
    phone: '9876543210',
    address: 'Salem',
    notes: '',
  })
  const product = await ipc<{ id: number; stockQty: number }>(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
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
  return { customer, product }
}

describe('old gold purchases', () => {
  useIntegrationEnv()

  it('records a purchase separately from inwards and reduces a linked sale bill', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const stockDate = '2026-09-25'

    await ipc(IPC_CHANNELS.STOCK_UPSERT, {
      stockDate,
      metal: 'Gold',
      itemName: 'Chain',
      openingWeight: 50,
    })

    const draft = await ipc<{ id: number; purchaseNo: string; status: string; totalAmount: number }>(
      IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE,
      {
        customerId: customer.id,
        customerName: 'Buyer',
        customerPhone: '9876543210',
        purchaseDate: stockDate,
        notes: '',
        items: [
          {
            description: 'Old chain',
            grossWeight: 10,
            stoneWeight: 0,
            netWeight: 10,
            purity: '22K',
            ratePerGram: 5000,
            deductionPct: 10,
          },
        ],
      },
    )
    expect(draft.status).toBe('draft')
    expect(draft.purchaseNo).toMatch(/^OGP-\d{4}-\d{4}$/)
    expect(draft.totalAmount).toBe(45000)

    const finalized = await ipc<{ status: string; totalAmount: number; purchaseNo: string; id: number }>(
      IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE,
      draft.id,
    )
    expect(finalized.status).toBe('final')

    const lookedUp = await ipc<{ id: number; totalAmount: number }>(
      IPC_CHANNELS.OLD_GOLD_PURCHASES_BY_NO,
      finalized.purchaseNo,
    )
    expect(lookedUp.id).toBe(finalized.id)
    expect(lookedUp.totalAmount).toBe(45000)

    const stockBefore = await ipc<Array<{ itemName: string; autoPurchaseIn: number; closingWeight: number }>>(
      IPC_CHANNELS.STOCK_LIST,
      { stockDate, metal: 'Gold' },
    )
    const chainBefore = stockBefore.find((row) => row.itemName === 'Chain')
    expect(chainBefore?.autoPurchaseIn).toBe(0)
    expect(chainBefore?.closingWeight).toBe(50)

    const inwards = await ipc<unknown[]>(IPC_CHANNELS.INVOICES_LIST)
    expect(Array.isArray(inwards)).toBe(true)

    const invoice = await ipc<{
      id: number
      total: number
      amountPayable: number
      oldGoldLinks: Array<{ purchaseNo: string; amountApplied: number }>
    }>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: stockDate,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 6000, metalRate: 6000, netWeight: 10, makingCharges: 0 }],
      oldGoldLinks: [{ purchaseId: finalized.id }],
    })

    expect(invoice.total).toBe(60000)
    expect(invoice.amountPayable).toBe(15000)
    expect(invoice.oldGoldLinks).toHaveLength(1)
    expect(invoice.oldGoldLinks[0].purchaseNo).toBe(finalized.purchaseNo)
    expect(invoice.oldGoldLinks[0].amountApplied).toBe(45000)

    const stockAfter = await ipc<Array<{ itemName: string; autoPurchaseIn: number; closingWeight: number }>>(
      IPC_CHANNELS.STOCK_LIST,
      { stockDate, metal: 'Gold' },
    )
    const chainAfter = stockAfter.find((row) => row.itemName === 'Chain')
    expect(chainAfter?.autoPurchaseIn).toBe(0)
    expect(chainAfter?.closingWeight).toBe(50)

    const duplicate = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: stockDate,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2 }],
      oldGoldLinks: [{ purchaseId: finalized.id }],
    })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.error).toMatch(/already applied/i)
  })

  it('blocks lookup of draft purchases', async () => {
    const { customer } = await seedCustomerAndProduct()
    const draft = await ipc<{ id: number; purchaseNo: string }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: '2026-09-25',
      items: [
        {
          description: 'Old gold',
          grossWeight: 2,
          netWeight: 2,
          purity: '22K',
          ratePerGram: 1000,
          deductionPct: 0,
        },
      ],
    })
    const result = await invokeIpcForTests(IPC_CHANNELS.OLD_GOLD_PURCHASES_BY_NO, draft.purchaseNo)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/draft/i)
  })
})
