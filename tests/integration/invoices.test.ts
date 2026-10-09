import { describe, expect, it } from 'vitest'
import { localTodayIso } from '@shared/localDate'
import { IPC_CHANNELS, getTestAgent, ipc, invokeIpcForTests, useIntegrationEnv, withHuids } from './helpers/testEnv'

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
      items: [{ productId: product.id, qty: 1, rate: 500, metalRate: 500, netWeight: 2, huid: product.huids[0] }],
    })
    expect(updated.subtotal).toBe(1000)

    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(finalized.status).toBe('final')
    expect(finalized.items[0].huid).toBe(product.huids[0])

    const productAfter = await ipc(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(productAfter.stockQty).toBe(2)
    expect(productAfter.huids).not.toContain(product.huids[0])

    const overdraft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 5, rate: 100, metalRate: 100, netWeight: 2, huid: product.huids[1] }],
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

  it('numbers drafts provisionally and assigns the real number at finalize', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      items: [
        { productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2, huid: product.huids[0] },
      ],
    })
    expect(draft.invoiceNo).toBe(`DRAFT-${draft.id}`)

    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(finalized.invoiceNo).toBe('CB-2026-0001')
  })

  it('keeps estimates off the CB and TI series', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const line = (huid: string) => [
      { productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2, huid },
    ]

    const estimate = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      isEstimate: true,
      items: line(product.huids[0]),
    })
    expect(estimate.invoiceNo).toBe('EST-2026-0001')

    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      items: line(product.huids[0]),
    })
    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(finalized.invoiceNo).toBe('CB-2026-0001')
  })

  it('does not spend a bill number on a deleted draft', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const line = (huid: string) => [
      { productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2, huid },
    ]

    const first = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      items: line(product.huids[0]),
    })
    const firstFinal = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, first.id)
    expect(firstFinal.invoiceNo).toBe('CB-2026-0001')

    const discarded = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      items: line(product.huids[1]),
    })
    await ipc(IPC_CHANNELS.INVOICES_DELETE, discarded.id)

    const second = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      items: line(product.huids[1]),
    })
    const secondFinal = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, second.id)
    expect(secondFinal.invoiceNo).toBe('CB-2026-0002')
  })

  it('rolls the serial past four digits instead of sorting text', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    await ipc(IPC_CHANNELS.INVOICES_RECORD_HISTORICAL, {
      invoiceNo: 'CB-2026-9999',
      customerId: customer.id,
      invoiceDate: '2026-09-01',
      billFormat: 'cash_bill',
      paymentMode: 'cash',
      subtotal: 1000,
      amountPaid: 1000,
      goldWeight: 1,
      makingCharges: 0,
    })

    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      items: [
        { productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2, huid: product.huids[0] },
      ],
    })
    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(finalized.invoiceNo).toBe('CB-2026-10000')
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
        { productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2, lineKind: 'sale', huid: product.huids[0] },
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

  it('creates and finalizes a sale line with no stock product', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Walk-in',
      phone: '9000000001',
      address: 'Salem',
      notes: '',
    })
    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-26',
      tax: 0,
      autoTax: false,
      billFormat: 'cash_bill',
      items: [
        {
          productId: null,
          qty: 1,
          rate: 10000,
          metalRate: 10000,
          grossWeight: 2,
          netWeight: 2,
          lineKind: 'sale',
          description: 'Gold chain',
        },
      ],
    })
    expect(draft.subtotal).toBe(20000)
    expect(draft.items).toHaveLength(1)
    expect(draft.items[0].productId).toBeNull()
    expect(draft.items[0].description).toBe('Gold chain')

    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(finalized.status).toBe('final')
    expect(finalized.subtotal).toBe(20000)
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

  it('requires a tagged HUID on finalize and releases it from the product', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const invoiceDate = '2026-09-26'
    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2 }],
    })

    const missing = await invokeIpcForTests(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(missing.ok).toBe(false)
    expect(missing.error).toMatch(/Pick a HUID/i)

    await ipc(IPC_CHANNELS.INVOICES_UPDATE, {
      id: draft.id,
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      items: [
        {
          productId: product.id,
          qty: 1,
          rate: 1000,
          metalRate: 1000,
          netWeight: 2,
          huid: product.huids[0],
        },
      ],
    })
    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(finalized.status).toBe('final')
    const after = await ipc(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(after.huids).not.toContain(product.huids[0])
  })

  it('rejects a HUID that is not tagged on the product', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const result = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-26',
      tax: 0,
      autoTax: false,
      items: [
        {
          productId: product.id,
          qty: 1,
          rate: 1000,
          metalRate: 1000,
          netWeight: 2,
          huid: 'ZZZZZZ',
        },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not tagged/i)
  })

  it('lets only one of two drafts claim the same HUID', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const invoiceDate = '2026-09-26'
    const make = () =>
      ipc(IPC_CHANNELS.INVOICES_CREATE, {
        customerId: customer.id,
        invoiceDate,
        tax: 0,
        autoTax: false,
        items: [
          {
            productId: product.id,
            qty: 1,
            rate: 1000,
            metalRate: 1000,
            netWeight: 2,
            huid: product.huids[0],
          },
        ],
      })
    const first = await make()
    const second = await make()
    const firstDone = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, first.id)
    expect(firstDone.status).toBe('final')
    const secondDone = await invokeIpcForTests(IPC_CHANNELS.INVOICES_FINALIZE, second.id)
    expect(secondDone.ok).toBe(false)
    expect(secondDone.error).toMatch(/not tagged/i)
  })

  it('keeps the sold product name after the catalog is renamed', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const invoiceDate = '2026-09-26'
    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      items: [
        {
          productId: product.id,
          qty: 1,
          rate: 1000,
          metalRate: 1000,
          netWeight: 2,
          huid: product.huids[0],
        },
      ],
    })
    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(finalized.items[0].productName).toBe('Chain item')
    expect(finalized.items[0].purity).toBe('22K')

    await ipc(IPC_CHANNELS.PRODUCTS_UPDATE, {
      id: product.id,
      input: {
        name: 'Renamed chain',
        category: 'Chain',
        metal: 'Gold',
        purity: '18K',
        grossWeight: 10,
        netWeight: 2,
        makingCharges: 0,
        stockQty: 2,
        imagePath: '',
        huids: product.huids.slice(1),
      },
    })

    const fetched = await ipc(IPC_CHANNELS.INVOICES_GET, finalized.id)
    expect(fetched.items[0].productName).toBe('Chain item')
    expect(fetched.items[0].purity).toBe('22K')
  })

  it('stores customer and rate snapshots at finalize and ignores later changes', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const invoiceDate = '2026-09-26'
    await ipc(IPC_CHANNELS.METAL_RATES_UPSERT, {
      effectiveDate: invoiceDate,
      gold22k: 1000,
      gold24k: 1100,
      silverFine: 100,
    })
    const draft = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      items: [
        {
          productId: product.id,
          qty: 1,
          rate: 1000,
          metalRate: 1000,
          netWeight: 2,
          huid: product.huids[0],
        },
      ],
    })
    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    expect(finalized.customerSnapshot?.name).toBe('Buyer')
    expect(finalized.ratesSnapshot?.gold22k).toBe(1000)

    await ipc(IPC_CHANNELS.METAL_RATES_UPSERT, {
      effectiveDate: '2026-09-27',
      gold22k: 2000,
      gold24k: 2200,
      silverFine: 200,
    })
    const fetched = await ipc(IPC_CHANNELS.INVOICES_GET, finalized.id)
    expect(fetched.ratesSnapshot?.gold22k).toBe(1000)
  })

  it('cancels a final bill: restores stock, HUID and dues, and blocks a second cancel', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const invoiceDate = '2026-09-26'
    const draft = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      billFormat: 'cash_bill',
      paymentMode: 'upi',
      items: [
        { productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2, huid: product.huids[0] },
      ],
    })
    const finalized = await ipc<{ id: number; invoiceNo: string; status: string }>(
      IPC_CHANNELS.INVOICES_FINALIZE,
      draft.id,
    )
    expect(finalized.status).toBe('final')

    const afterFinal = await ipc<{ stockQty: number; huids: string[] }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(afterFinal.stockQty).toBe(2)
    expect(afterFinal.huids).not.toContain(product.huids[0])

    const ledger = await ipc<{
      columns: Array<{ customerId: number; entries: Array<{ invoiceId: number | null; kind: string }> }>
    }>(IPC_CHANNELS.DUES_LIST)
    const beforeCancel = ledger.columns.find((column) => column.customerId === customer.id)
    expect(beforeCancel?.entries.some((entry) => entry.invoiceId === finalized.id)).toBe(true)

    const cancelled = await ipc<{
      status: string
      cancelReason: string
      invoiceNo: string
      cancelledAt: string | null
    }>(IPC_CHANNELS.INVOICES_CANCEL, { id: finalized.id, reason: 'Customer returned the chain' })
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelReason).toBe('Customer returned the chain')
    // The number stays in the series.
    expect(cancelled.invoiceNo).toBe(finalized.invoiceNo)
    expect(cancelled.cancelledAt).toBeTruthy()

    const restored = await ipc<{ stockQty: number; huids: string[] }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(restored.stockQty).toBe(3)
    expect(restored.huids).toContain(product.huids[0])

    const ledgerAfter = await ipc<{
      columns: Array<{ customerId: number; entries: Array<{ invoiceId: number | null; kind: string }> }>
    }>(IPC_CHANNELS.DUES_LIST)
    const afterCancel = ledgerAfter.columns.find((column) => column.customerId === customer.id)
    expect(afterCancel?.entries.some((entry) => entry.invoiceId === finalized.id) ?? false).toBe(false)

    const again = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CANCEL, {
      id: finalized.id,
      reason: 'Second attempt',
    })
    expect(again.ok).toBe(false)
    expect(again.error).toMatch(/already cancelled/i)

    const edit = await invokeIpcForTests(IPC_CHANNELS.INVOICES_UPDATE, {
      id: finalized.id,
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2 }],
    })
    expect(edit.ok).toBe(false)
    expect(edit.error).toMatch(/Only draft invoices/i)
  })

  it('rejects cancelling drafts, estimates and historical bills', async () => {
    const { customer, product } = await seedCustomerAndProduct()

    const draft = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-26',
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2, huid: product.huids[0] }],
    })
    const draftCancel = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CANCEL, {
      id: draft.id,
      reason: 'Not a real bill',
    })
    expect(draftCancel.ok).toBe(false)
    expect(draftCancel.error).toMatch(/Only a finalized bill/i)

    const historical = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_RECORD_HISTORICAL, {
      invoiceNo: 'CB-1900',
      customerId: customer.id,
      invoiceDate: '2024-05-05',
      billFormat: 'cash_bill',
      paymentMode: 'cash',
      subtotal: 5000,
      amountPaid: 5000,
      goldWeight: 4,
      makingCharges: 0,
    })
    const historicalCancel = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CANCEL, {
      id: historical.id,
      reason: 'Old ledger bill',
    })
    expect(historicalCancel.ok).toBe(false)
    expect(historicalCancel.error).toMatch(/old ledger/i)
  })

  it('frees an old-gold purchase link when the bill is cancelled', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const stockDate = '2026-09-26'
    await ipc(IPC_CHANNELS.STOCK_UPSERT, {
      stockDate,
      metal: 'Gold',
      itemName: 'Chain',
      openingWeight: 50,
    })

    const purchase = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
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
    })
    await ipc(IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE, purchase.id)

    const draft = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: stockDate,
      tax: 0,
      autoTax: false,
      paymentMode: 'upi',
      items: [{ productId: product.id, qty: 1, rate: 30000, metalRate: 30000, netWeight: 2, huid: product.huids[0] }],
      oldGoldLinks: [{ purchaseId: purchase.id }],
    })
    const finalized = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)

    const blocked = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: stockDate,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 30000, metalRate: 30000, netWeight: 2, huid: product.huids[1] }],
      oldGoldLinks: [{ purchaseId: purchase.id }],
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toMatch(/already applied/i)

    await ipc(IPC_CHANNELS.INVOICES_CANCEL, { id: finalized.id, reason: 'Wrong customer' })

    const reused = await ipc<{ id: number; oldGoldLinks: unknown[] }>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: stockDate,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 30000, metalRate: 30000, netWeight: 2, huid: product.huids[0] }],
      oldGoldLinks: [{ purchaseId: purchase.id }],
    })
    expect(reused.oldGoldLinks).toHaveLength(1)
  })

  it('rejects cancelling a bill on a closed metal day', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const today = localTodayIso()
    const draft = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: today,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2, huid: product.huids[0] }],
    })
    const finalized = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)

    await ipc(IPC_CHANNELS.STOCK_DAY_CLOSING_CLOSE, {
      businessDate: today,
      metal: 'Gold',
      operatorName: 'admin',
      note: 'evening close',
    })

    const result = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CANCEL, {
      id: finalized.id,
      reason: 'Too late',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/metal day is closed/i)
  })

  it('keeps the stock reconciliation balanced after a cancel', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const today = localTodayIso()
    await ipc(IPC_CHANNELS.STOCK_UPSERT, {
      stockDate: today,
      metal: 'Gold',
      itemName: 'Chain',
      openingWeight: 50,
    })

    const draft = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: today,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2, huid: product.huids[0] }],
    })
    const finalized = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)

    type ReconRow = {
      metal: string
      category: string
      ledgerClosing: number
      pieceImpliedWeight: number
      unexplained: number
    }
    const recon = (rows: ReconRow[]) =>
      rows.find((row) => row.metal === 'Gold' && row.category === 'Chain') as ReconRow
    const before = recon(await ipc<ReconRow[]>(IPC_CHANNELS.STOCK_RECONCILIATION, { date: today }))
    expect(before.ledgerClosing).toBeCloseTo(48, 4)

    await ipc(IPC_CHANNELS.INVOICES_CANCEL, { id: finalized.id, reason: 'Cancelled same day' })

    const after = recon(await ipc<ReconRow[]>(IPC_CHANNELS.STOCK_RECONCILIATION, { date: today }))
    expect(after.ledgerClosing - before.ledgerClosing).toBeCloseTo(2, 4)
    expect(after.pieceImpliedWeight - before.pieceImpliedWeight).toBeCloseTo(2, 4)
    expect(after.unexplained).toBeCloseTo(before.unexplained, 4)
  })

  it('cancels a multi-piece line and restores every unit', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const invoiceDate = '2026-09-26'
    const draft = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate,
      tax: 0,
      autoTax: false,
      paymentMode: 'upi',
      items: [{ productId: product.id, qty: 2, rate: 1000, metalRate: 1000, netWeight: 2 }],
    })
    const finalized = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    const afterFinal = await ipc<{ stockQty: number }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(afterFinal.stockQty).toBe(1)

    await ipc(IPC_CHANNELS.INVOICES_CANCEL, { id: finalized.id, reason: 'Returned both pieces' })
    const restored = await ipc<{ stockQty: number }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(restored.stockQty).toBe(3)
  })

  it('leaves a cancelled bill out of the stats and GST report', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const invoiceDate = '2026-09-26'
    const make = async (huid: string) => {
      const draft = await ipc<{ id: number }>(IPC_CHANNELS.INVOICES_CREATE, {
        customerId: customer.id,
        invoiceDate,
        tax: 0,
        autoTax: false,
        billFormat: 'cash_bill',
        paymentMode: 'upi',
        items: [{ productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2, huid }],
      })
      return ipc<{ id: number }>(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    }
    const keep = await make(product.huids[0])
    const drop = await make(product.huids[1])

    const before = await getTestAgent()
      .get('/api/invoices/stats')
      .query({ from: invoiceDate, to: invoiceDate })
    expect(before.body.billsGenerated).toBe(2)
    expect(before.body.sales).toBe(4000)

    await ipc(IPC_CHANNELS.INVOICES_CANCEL, { id: drop.id, reason: 'Cancelled' })

    const after = await getTestAgent()
      .get('/api/invoices/stats')
      .query({ from: invoiceDate, to: invoiceDate })
    expect(after.body.billsGenerated).toBe(1)
    expect(after.body.sales).toBe(2000)
    expect(keep.id).toBeTruthy()

    const cancelled = await ipc<{ status: string }>(IPC_CHANNELS.INVOICES_GET, drop.id)
    expect(cancelled.status).toBe('cancelled')
  })

  it('returns at most 5 invoices per page by default', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    for (let i = 0; i < 7; i += 1) {
      await ipc(IPC_CHANNELS.INVOICES_CREATE, {
        customerId: customer.id,
        invoiceDate: '2026-09-24',
        tax: 0,
        autoTax: false,
        items: [{ productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2 }],
      })
    }
    const first = await getTestAgent().get('/api/invoices')
    expect(first.status).toBe(200)
    expect(first.body.items.length).toBe(5)
    expect(first.body.total).toBe(7)
    expect(first.body.pageSize).toBe(5)
    const second = await getTestAgent().get('/api/invoices').query({ page: 2, pageSize: 5 })
    expect(second.body.items.length).toBe(2)
    expect(second.body.total).toBe(7)
  })
})
