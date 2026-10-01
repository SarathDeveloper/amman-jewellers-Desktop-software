import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, ipc, invokeIpcForTests, useIntegrationEnv, withHuids } from './helpers/testEnv'

async function seedCustomerAndProduct() {
  const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
    name: 'Buyer',
    phone: '9876543210',
    address: 'Salem',
    notes: '',
  })
  const product = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
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

describe('invoices IPC', () => {
  useIntegrationEnv()

  it('creates draft, updates, finalizes with stock deduction, and blocks insufficient stock', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const invoiceDate = '2026-09-24'

    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate,
      tax: 50,
      autoTax: false,
      items: [{ productId: product.id, qty: 2, rate: 1000, metalRate: 1000, netWeight: 2 }],
    })
    expect(draft.status).toBe('draft')
    expect(draft.subtotal).toBe(4000)
    expect(draft.total).toBe(4050)

    const updated = await ipc(IPC_CHANNELS.INVOICES_UPDATE, {
      id: draft.id,
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 500, metalRate: 500, netWeight: 2 }],
    })
    expect(updated.subtotal).toBe(1000)

    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(finalized.status).toBe('final')

    const productAfter = await ipc(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(productAfter.stockQty).toBe(2)

    const overdraft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 5, rate: 100, metalRate: 100, netWeight: 2 }],
    })
    const failResult = await invokeIpcForTests(IPC_CHANNELS.INVOICES_FINALIZE, overdraft.id)
    expect(failResult.ok).toBe(false)
    expect(failResult.error).toMatch(/Insufficient stock/i)
  })

  it('deletes only draft invoices', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2 }],
    })
    await ipc(IPC_CHANNELS.INVOICES_DELETE, draft.id)
    const list = await ipc(IPC_CHANNELS.INVOICES_LIST)
    expect(list).toHaveLength(0)
  })

  it('rejects finalizing estimates', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const estimate = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      isEstimate: true,
      items: [{ productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2 }],
    })
    const failResult = await invokeIpcForTests(IPC_CHANNELS.INVOICES_FINALIZE, estimate.id)
    expect(failResult.ok).toBe(false)
    expect(failResult.error).toMatch(/Estimates cannot be finalized/i)
  })

  it('records an old bill without deducting stock and posts the balance to dues', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const before = await ipc(IPC_CHANNELS.PRODUCTS_GET, product.id)

    const bill = await ipc(IPC_CHANNELS.INVOICES_RECORD_HISTORICAL, {
      invoiceNo: 'CB-1842',
      customerId: customer.id,
      invoiceDate: '2024-03-12',
      billFormat: 'cash_bill',
      paymentMode: 'cash',
      subtotal: 10000,
      amountPaid: 4000,
      goldWeight: 8.5,
      makingCharges: 500,
    })

    expect(bill.status).toBe('final')
    expect(bill.isHistorical).toBe(true)
    expect(bill.invoiceNo).toBe('CB-1842')
    expect(bill.balanceDue).toBe(6000)
    expect(bill.summaryGoldG).toBe(8.5)

    const after = await ipc(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(after.stockQty).toBe(before.stockQty)

    const ledger = await ipc(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customer.id)
    expect(column?.entries.some((entry) => entry.invoiceId === bill.id && entry.kind === 'due')).toBe(true)

    const duplicate = await invokeIpcForTests(IPC_CHANNELS.INVOICES_RECORD_HISTORICAL, {
      invoiceNo: 'CB-1842',
      customerId: customer.id,
      invoiceDate: '2024-03-12',
      billFormat: 'cash_bill',
      paymentMode: 'cash',
      subtotal: 100,
      amountPaid: 100,
    })
    expect(duplicate.ok).toBe(false)
  })

  it('keeps old cash bills out of the GST report and includes old tax invoices', async () => {
    const { customer } = await seedCustomerAndProduct()
    await ipc(IPC_CHANNELS.INVOICES_RECORD_HISTORICAL, {
      invoiceNo: 'OLD-CASH',
      customerId: customer.id,
      invoiceDate: '2024-01-10',
      billFormat: 'cash_bill',
      paymentMode: 'cash',
      subtotal: 2000,
      amountPaid: 2000,
    })
    await ipc(IPC_CHANNELS.INVOICES_RECORD_HISTORICAL, {
      invoiceNo: 'OLD-TAX',
      customerId: customer.id,
      invoiceDate: '2024-01-11',
      billFormat: 'tax_invoice',
      paymentMode: 'upi',
      subtotal: 1000,
      discount: 0,
      autoTax: true,
      amountPaid: 1000,
    })

    const report = await ipc(IPC_CHANNELS.INVOICES_TAX_REPORT)
    const january = report.find((row) => row.month === '2024-01')
    expect(january?.invoiceCount).toBe(1)
    expect(january?.taxableSales).toBe(1000)
  })

  it('rejects invoices for missing customers', async () => {
    const product = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Walk ring',
      category: 'Ring',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 3,
      netWeight: 2.5,
      makingCharges: 0,
      stockQty: 5,
      imagePath: '',
    }))

    const missing = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: 999999,
      invoiceDate: '2026-09-26',
      tax: 0,
      autoTax: false,
      billFormat: 'cash_bill',
      items: [{ productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2.5 }],
    })
    expect(missing.ok).toBe(false)
    expect(missing.error).toMatch(/customer not found/i)
  })

  it('applies old-gold exchange credit without deducting piece stock', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-26',
      tax: 0,
      autoTax: false,
      billFormat: 'cash_bill',
      items: [
        { productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2, lineKind: 'sale' },
        {
          productId: null,
          qty: 1,
          rate: 900,
          metalRate: 900,
          netWeight: 1,
          lineKind: 'exchange',
          description: 'Old gold exchange',
          metal: 'Gold',
          category: 'Chain',
        },
      ],
    })
    expect(draft.subtotal).toBe(2000)
    expect(draft.amountPayable).toBe(1100)
    expect(draft.items.some((item: { lineKind: string }) => item.lineKind === 'exchange')).toBe(true)

    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(finalized.status).toBe('final')
    const after = await ipc(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(after.stockQty).toBe(2)

    const stock = await ipc(IPC_CHANNELS.STOCK_LIST, { stockDate: '2026-09-26', metal: 'Gold' })
    const chain = stock.find((row: { itemName: string }) => row.itemName === 'Chain')
    expect(chain?.autoSales).toBe(2)
    expect(chain?.autoExchangeIn).toBe(0)
    expect(chain?.closingWeight).toBe(
      chain.openingWeight +
        chain.autoPurchaseIn -
        chain.effectiveSales,
    )
  })

  it('round-trips percent-mode and rupee-mode VA/MC lines', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-26',
      tax: 0,
      autoTax: false,
      billFormat: 'tax_invoice',
      items: [
        {
          productId: product.id,
          qty: 1,
          rate: 14025,
          metalRate: 14025,
          grossWeight: 2,
          netWeight: 2,
          makingCharges: 0,
          wastagePct: 4,
          otherCharges: 150,
        },
        {
          productId: product.id,
          qty: 1,
          rate: 14025,
          metalRate: 14025,
          grossWeight: 2,
          netWeight: 2,
          makingCharges: 500,
          wastagePct: 0,
        },
      ],
    })

    expect(draft.items[0].otherCharges).toBe(150)
    expect(draft.items[0].makingCharges).toBe(0)
    expect(draft.items[0].wastagePct).toBe(4)
    expect(draft.items[1].makingCharges).toBe(500)
    expect(draft.items[1].wastagePct).toBe(0)
    expect(draft.subtotal).toBe(57872)

    const fetched = await ipc(IPC_CHANNELS.INVOICES_GET, draft.id)
    expect(fetched.items[0].otherCharges).toBe(150)
    expect(fetched.items[1].makingCharges).toBe(500)
    expect(fetched.subtotal).toBe(57872)
  })

  it('rejects sale lines with both wastage percent and labour amount', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const result = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-26',
      tax: 0,
      autoTax: false,
      billFormat: 'tax_invoice',
      items: [
        {
          productId: product.id,
          qty: 1,
          rate: 14025,
          metalRate: 14025,
          grossWeight: 2,
          netWeight: 2,
          makingCharges: 500,
          wastagePct: 4,
        },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/VA\/MC accepts either a wastage percent or a labour amount/)
  })
})
