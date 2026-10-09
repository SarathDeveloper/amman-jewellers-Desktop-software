import { describe, expect, it } from 'vitest'
import type { ReportResult } from '@shared/reportsCatalog'
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

  it('applies one purchase across two bills and rejects over-application', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const date = '2026-09-25'

    const draft = await ipc<{ id: number; purchaseNo: string }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: date,
      items: [
        { description: 'Old chain', grossWeight: 10, netWeight: 10, purity: '22K', ratePerGram: 5000, deductionPct: 10 },
      ],
    })
    const finalized = await ipc<{ id: number; totalAmount: number }>(
      IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE,
      draft.id,
    )
    expect(finalized.totalAmount).toBe(45000)

    const first = await ipc<{ amountPayable: number; oldGoldLinks: Array<{ amountApplied: number }> }>(
      IPC_CHANNELS.INVOICES_CREATE,
      {
        customerId: customer.id,
        invoiceDate: date,
        tax: 0,
        autoTax: false,
        items: [{ productId: product.id, qty: 1, rate: 6000, metalRate: 6000, netWeight: 10, makingCharges: 0 }],
        oldGoldLinks: [{ purchaseId: finalized.id, amount: 20000 }],
      },
    )
    expect(first.oldGoldLinks[0].amountApplied).toBe(20000)
    expect(first.amountPayable).toBe(40000)

    const afterFirst = await ipc<{ paidOut: number; applied: number; balance: number }>(
      IPC_CHANNELS.OLD_GOLD_PURCHASES_GET,
      finalized.id,
    )
    expect(afterFirst.applied).toBe(20000)
    expect(afterFirst.balance).toBe(25000)

    const second = await ipc<{ amountPayable: number; oldGoldLinks: Array<{ amountApplied: number }> }>(
      IPC_CHANNELS.INVOICES_CREATE,
      {
        customerId: customer.id,
        invoiceDate: date,
        tax: 0,
        autoTax: false,
        items: [{ productId: product.id, qty: 1, rate: 6000, metalRate: 6000, netWeight: 10, makingCharges: 0 }],
        oldGoldLinks: [{ purchaseId: finalized.id, amount: 25000 }],
      },
    )
    expect(second.oldGoldLinks[0].amountApplied).toBe(25000)
    expect(second.amountPayable).toBe(35000)

    const exhausted = await ipc<{ balance: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_GET, finalized.id)
    expect(exhausted.balance).toBe(0)

    const overApplication = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: date,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2, makingCharges: 0 }],
      oldGoldLinks: [{ purchaseId: finalized.id, amount: 1 }],
    })
    expect(overApplication.ok).toBe(false)
    expect(overApplication.error).toMatch(/already applied|no balance/i)
  })

  it('draws the balance down with payouts and restores it when a payout is voided', async () => {
    const { customer } = await seedCustomerAndProduct()
    const draft = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: '2026-09-25',
      items: [
        { description: 'Old gold', grossWeight: 10, netWeight: 10, purity: '22K', ratePerGram: 5000, deductionPct: 10 },
      ],
    })
    const finalized = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE, draft.id)

    const payout = await ipc<{ balance: number; paidOut: number; payouts: Array<{ id: number }> }>(
      IPC_CHANNELS.OLD_GOLD_PURCHASES_PAYOUT,
      {
        id: finalized.id,
        input: { payoutDate: '2026-09-25', amount: 10000, mode: 'cash', note: 'Counter cash' },
      },
    )
    expect(payout.paidOut).toBe(10000)
    expect(payout.balance).toBe(35000)

    const tooMuch = await invokeIpcForTests(IPC_CHANNELS.OLD_GOLD_PURCHASES_PAYOUT, {
      id: finalized.id,
      input: { payoutDate: '2026-09-25', amount: 40000, mode: 'cash', note: '' },
    })
    expect(tooMuch.ok).toBe(false)
    expect(tooMuch.error).toMatch(/exceed the balance/i)

    const payoutId = payout.payouts[0].id
    const voided = await ipc<{ balance: number; paidOut: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_VOID_PAYOUT, {
      id: finalized.id,
      payoutId,
      reason: 'Wrong amount',
    })
    expect(voided.paidOut).toBe(0)
    expect(voided.balance).toBe(45000)
  })

  it('cancels a clean finalized purchase and blocks one that is claimed', async () => {
    const { customer, product } = await seedCustomerAndProduct()
    const date = '2026-09-25'

    const cleanDraft = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: date,
      items: [{ description: 'Old gold', grossWeight: 5, netWeight: 5, purity: '22K', ratePerGram: 5000, deductionPct: 0 }],
    })
    const clean = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE, cleanDraft.id)
    const cancelled = await ipc<{ status: string; cancelReason: string }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CANCEL, {
      id: clean.id,
      reason: 'Recorded twice',
    })
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelReason).toBe('Recorded twice')

    const lookup = await invokeIpcForTests(IPC_CHANNELS.OLD_GOLD_PURCHASES_BY_NO, 'OGP-2026-0001')
    expect(lookup.ok).toBe(false)

    const linkedDraft = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: date,
      items: [{ description: 'Old gold', grossWeight: 5, netWeight: 5, purity: '22K', ratePerGram: 5000, deductionPct: 0 }],
    })
    const linked = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE, linkedDraft.id)
    await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: date,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 6000, metalRate: 6000, netWeight: 10, makingCharges: 0 }],
      oldGoldLinks: [{ purchaseId: linked.id, amount: 10000 }],
    })
    const blocked = await invokeIpcForTests(IPC_CHANNELS.OLD_GOLD_PURCHASES_CANCEL, {
      id: linked.id,
      reason: 'Mistake',
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toMatch(/applied to a sale bill/i)
  })

  it('runs the refiner batch lifecycle and releases items on cancel', async () => {
    const { customer } = await seedCustomerAndProduct()
    const date = '2026-09-25'

    const firstDraft = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: date,
      items: [
        {
          description: 'Old chain',
          grossWeight: 10,
          netWeight: 10,
          purity: '22K',
          ratePerGram: 5000,
          deductionPct: 0,
          touchPct: 80,
        },
      ],
    })
    const first = await ipc<{ id: number; items: Array<{ id: number }> }>(
      IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE,
      firstDraft.id,
    )

    const secondDraft = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: date,
      items: [
        { description: 'Old ring', grossWeight: 5, netWeight: 5, purity: '22K', ratePerGram: 5000, deductionPct: 0 },
      ],
    })
    const second = await ipc<{ id: number; items: Array<{ id: number }> }>(
      IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE,
      secondDraft.id,
    )

    const lot = await ipc<{
      groups: Array<{ metal: string; items: number; grossWeight: number; fineWeight: number; costAmount: number }>
      items: Array<{ id: number }>
    }>(IPC_CHANNELS.OLD_GOLD_BATCHES_LOT)
    expect(lot.items).toHaveLength(2)
    const goldGroup = lot.groups.find((group) => group.metal === 'Gold')
    expect(goldGroup?.items).toBe(2)
    expect(goldGroup?.grossWeight).toBe(15)
    expect(goldGroup?.fineWeight).toBe(13)
    expect(goldGroup?.costAmount).toBe(65000)

    const batch = await ipc<{
      id: number
      batchNo: string
      status: string
      grossWeight: number
      fineWeightExpected: number
      costAmount: number
      items: Array<unknown>
    }>(IPC_CHANNELS.OLD_GOLD_BATCHES_CREATE, {
      itemIds: lot.items.map((item) => item.id),
      createdDate: date,
      notes: '',
    })
    expect(batch.batchNo).toMatch(/^OGB-2026-\d{4}$/)
    expect(batch.status).toBe('open')
    expect(batch.grossWeight).toBe(15)
    expect(batch.fineWeightExpected).toBe(13)
    expect(batch.costAmount).toBe(65000)
    expect(batch.items).toHaveLength(2)

    const emptyLot = await ipc<{ items: Array<unknown> }>(IPC_CHANNELS.OLD_GOLD_BATCHES_LOT)
    expect(emptyLot.items).toHaveLength(0)

    const melted = await ipc<{ status: string; meltedWeight: number }>(IPC_CHANNELS.OLD_GOLD_BATCHES_MELT, {
      id: batch.id,
      input: { meltDate: date, meltedWeight: 14.5 },
    })
    expect(melted.status).toBe('melted')
    expect(melted.meltedWeight).toBe(14.5)

    const sent = await ipc<{ status: string; sentWeight: number }>(IPC_CHANNELS.OLD_GOLD_BATCHES_SEND, {
      id: batch.id,
      input: { sentDate: date, sentWeight: 14.4 },
    })
    expect(sent.status).toBe('sent')

    const settled = await ipc<{ status: string; gainLoss: number }>(IPC_CHANNELS.OLD_GOLD_BATCHES_SETTLE, {
      id: batch.id,
      input: {
        settledDate: date,
        fineWeightReceived: 12.8,
        fineRate: 6000,
        cashReceived: 1000,
        settlementMode: 'cash',
      },
    })
    expect(settled.status).toBe('settled')
    expect(settled.gainLoss).toBe(12800)

    // Cancelling the purchase is blocked while one of its items sits in a batch.
    const blocked = await invokeIpcForTests(IPC_CHANNELS.OLD_GOLD_PURCHASES_CANCEL, {
      id: first.id,
      reason: 'Mistake',
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toMatch(/refiner batch/i)

    const cancelDraft = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: date,
      items: [
        { description: 'Old bangle', grossWeight: 4, netWeight: 4, purity: '22K', ratePerGram: 5000, deductionPct: 0 },
      ],
    })
    const cancelFinal = await ipc<{ id: number; items: Array<{ id: number }> }>(
      IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE,
      cancelDraft.id,
    )
    const readyLot = await ipc<{ items: Array<{ id: number }> }>(IPC_CHANNELS.OLD_GOLD_BATCHES_LOT)
    const newItemId = cancelFinal.items[0].id
    expect(readyLot.items.some((item) => item.id === newItemId)).toBe(true)

    const secondBatch = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_BATCHES_CREATE, {
      itemIds: [newItemId],
      createdDate: date,
      notes: '',
    })
    const cancelled = await ipc<{ status: string; items: Array<unknown> }>(
      IPC_CHANNELS.OLD_GOLD_BATCHES_CANCEL,
      { id: secondBatch.id, reason: 'Wrong refiner' },
    )
    expect(cancelled.status).toBe('cancelled')
    const restored = await ipc<{ items: Array<{ id: number }> }>(IPC_CHANNELS.OLD_GOLD_BATCHES_LOT)
    expect(restored.items.some((item) => item.id === newItemId)).toBe(true)
  })

  it('reports old gold purchases, purity summary and payouts', async () => {
    const { customer } = await seedCustomerAndProduct()
    const date = '2026-09-25'
    const draft = await ipc<{ id: number }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: date,
      items: [
        {
          description: 'Old chain',
          grossWeight: 11,
          netWeight: 10,
          purity: '22K',
          ratePerGram: 5000,
          deductionPct: 0,
          touchPct: 80,
        },
      ],
    })
    const finalized = await ipc<{ id: number; totalAmount: number }>(
      IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE,
      draft.id,
    )
    expect(finalized.totalAmount).toBe(40000)
    await ipc(IPC_CHANNELS.OLD_GOLD_PURCHASES_PAYOUT, {
      id: finalized.id,
      input: { payoutDate: date, amount: 5000, mode: 'cash', note: '' },
    })

    const register = await ipc<ReportResult>(IPC_CHANNELS.REPORTS_RUN, {
      id: 'old-gold-purchase-register',
      from: date,
      to: date,
    })
    expect(register.rows).toHaveLength(1)
    expect(register.rows[0].customer).toBe('Buyer')
    expect(register.rows[0].netWeight).toBe(10)
    expect(register.rows[0].paidOut).toBe(5000)
    expect(register.rows[0].balance).toBe(35000)

    const purity = await ipc<ReportResult>(IPC_CHANNELS.REPORTS_RUN, {
      id: 'old-gold-purity-summary',
      from: date,
      to: date,
    })
    expect(purity.rows).toHaveLength(1)
    expect(purity.rows[0].purity).toBe('22K')
    expect(purity.rows[0].fine).toBe(8)

    const payouts = await ipc<ReportResult>(IPC_CHANNELS.REPORTS_RUN, {
      id: 'old-gold-payouts',
      from: date,
      to: date,
    })
    expect(payouts.rows).toHaveLength(1)
    expect(payouts.totals.amount).toBe(5000)

    const daily = await ipc<ReportResult>(IPC_CHANNELS.REPORTS_RUN, {
      id: 'daily-business-summary',
      from: date,
      to: date,
    })
    expect(daily.rows[0].oldGoldBought).toBe(40000)
    expect(daily.rows[0].oldGoldPaidOut).toBe(5000)
  })

  it('numbers a purchase from its own date year', async () => {
    const { customer } = await seedCustomerAndProduct()
    const backdated = await ipc<{ purchaseNo: string }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: '2025-12-15',
      items: [{ description: 'Old gold', grossWeight: 2, netWeight: 2, purity: '22K', ratePerGram: 1000, deductionPct: 0 }],
    })
    expect(backdated.purchaseNo).toMatch(/^OGP-2025-/)

    const current = await ipc<{ purchaseNo: string }>(IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE, {
      customerId: customer.id,
      customerName: 'Buyer',
      customerPhone: '9876543210',
      purchaseDate: '2026-01-05',
      items: [{ description: 'Old gold', grossWeight: 2, netWeight: 2, purity: '22K', ratePerGram: 1000, deductionPct: 0 }],
    })
    expect(current.purchaseNo).toMatch(/^OGP-2026-0001$/)
  })
})
