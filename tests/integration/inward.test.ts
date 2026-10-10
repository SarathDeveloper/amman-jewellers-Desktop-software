import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, ipc, invokeIpcForTests, useIntegrationEnv, testHuids, withHuids } from './helpers/testEnv'

describe('inward and metal day close', () => {
  useIntegrationEnv()

  it('finalizes inward, increases piece qty, and feeds autoPurchaseIn into closing', async () => {
    const stockDate = '2026-09-25'
    const supplier = await ipc<{ id: number }>(IPC_CHANNELS.SUPPLIERS_CREATE, {
      name: 'Gold Supplier',
      phone: '',
      address: '',
      notes: '',
    })
    const product = await ipc<{ id: number; stockQty: number; huids: string[] }>(
      IPC_CHANNELS.PRODUCTS_CREATE,
      withHuids({
        name: 'Gold chain inward',
        category: 'Chain',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 10,
        netWeight: 4,
        makingCharges: 0,
        stockQty: 2,
        imagePath: '',
      }),
    )

    await ipc(IPC_CHANNELS.STOCK_UPSERT, {
      stockDate,
      metal: 'Gold',
      itemName: 'Chain',
      openingWeight: 50,
    })

    const newHuids = testHuids(3)
    const inward = await ipc<{ id: number; items: Array<{ huids: string[] }> }>(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: stockDate,
      notes: '',
      items: [
        {
          productId: product.id,
          metal: 'Gold',
          category: 'Chain',
          purity: '22K',
          qty: 3,
          netWeight: 2,
          rate: 100,
          huids: newHuids,
        },
      ],
    })
    expect(inward.items[0].huids).toEqual(newHuids)
    await ipc(IPC_CHANNELS.INWARDS_FINALIZE, inward.id)

    const productAfter = await ipc<{ stockQty: number; huids: string[] }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(productAfter.stockQty).toBe(5)
    expect(productAfter.huids).toEqual([...product.huids, ...newHuids])

    const rows = await ipc<
      Array<{
        itemName: string
        autoPurchaseIn: number
        closingWeight: number
        openingWeight: number
        effectiveSales: number
        autoExchangeIn: number
      }>
    >(IPC_CHANNELS.STOCK_LIST, { stockDate, metal: 'Gold' })
    const chain = rows.find((row) => row.itemName === 'Chain')
    expect(chain?.autoPurchaseIn).toBe(6)
    expect(chain?.closingWeight).toBe(56)

    const dayLines = await ipc<Array<{ documentNo: string; weightTotal: number }>>(
      IPC_CHANNELS.STOCK_DAY_LINES,
      { stockDate, metal: 'Gold', itemName: 'Chain', kind: 'inward' },
    )
    expect(dayLines).toHaveLength(1)
    expect(dayLines[0].weightTotal).toBe(6)
  })

  it('appends one inward HUID per piece and rejects a duplicate of an existing code', async () => {
    const supplier = await ipc<{ id: number }>(IPC_CHANNELS.SUPPLIERS_CREATE, {
      name: 'HUID Supplier',
      phone: '',
      address: '',
      notes: '',
    })
    const product = await ipc<{ id: number; huids: string[] }>(
      IPC_CHANNELS.PRODUCTS_CREATE,
      withHuids({
        name: 'Gold ring inward',
        category: 'Ring',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 3,
        netWeight: 2.5,
        makingCharges: 0,
        stockQty: 1,
        imagePath: '',
      }),
    )
    expect(product.huids).toHaveLength(1)

    const extra = testHuids(1)
    const inward = await ipc<{ id: number; items: Array<{ huids: string[] }> }>(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: '2026-09-25',
      notes: '',
      items: [
        {
          productId: product.id,
          metal: 'Gold',
          category: 'Ring',
          purity: '22K',
          qty: 1,
          netWeight: 2.5,
          rate: 100,
          huids: extra,
        },
      ],
    })
    expect(inward.items[0].huids).toEqual(extra)
    await ipc(IPC_CHANNELS.INWARDS_FINALIZE, inward.id)

    const after = await ipc<{ stockQty: number; huids: string[] }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(after.stockQty).toBe(2)
    expect(after.huids).toEqual([...product.huids, ...extra])

    const sameLineDup = await invokeIpcForTests(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: '2026-09-25',
      notes: '',
      items: [
        {
          productId: product.id,
          metal: 'Gold',
          category: 'Ring',
          purity: '22K',
          qty: 2,
          netWeight: 2.5,
          rate: 100,
          huids: ['ZZZZZ1', 'ZZZZZ1'],
        },
      ],
    })
    expect(sameLineDup.ok).toBe(false)
    if (!sameLineDup.ok) {
      expect(sameLineDup.error).toMatch(/duplicated/)
    }

    const duplicate = await invokeIpcForTests<{ id: number }>(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: '2026-09-25',
      notes: '',
      items: [
        {
          productId: product.id,
          metal: 'Gold',
          category: 'Ring',
          purity: '22K',
          qty: 1,
          netWeight: 2.5,
          rate: 100,
          huids: product.huids,
        },
      ],
    })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) {
      expect(duplicate.error).toMatch(/already used/)
    }

    const acrossLines = await invokeIpcForTests(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: '2026-09-25',
      items: [1, 2].map(() => ({
        productId: product.id,
        metal: 'Gold',
        category: 'Ring',
        purity: '22K',
        qty: 1,
        netWeight: 2.5,
        rate: 100,
        huids: ['ZZZZZ2'],
      })),
    })
    expect(acrossLines.ok).toBe(false)
    if (!acrossLines.ok) {
      expect(acrossLines.error).toMatch(/more than one line/)
    }
  })

  it('saves a draft before HUIDs are known and finalizes without them', async () => {
    const supplier = await ipc<{ id: number }>(IPC_CHANNELS.SUPPLIERS_CREATE, {
      name: 'Draft Supplier',
      phone: '',
      address: '',
      notes: '',
    })
    const gold = await ipc<{ id: number }>(IPC_CHANNELS.PRODUCTS_CREATE, {
      name: 'Gold stud pending hallmark',
      category: 'Stud',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 2,
      netWeight: 2,
      makingCharges: 0,
      stockQty: 0,
      imagePath: '',
    })
    const silver = await ipc<{ id: number }>(IPC_CHANNELS.PRODUCTS_CREATE, {
      name: 'Silver anklet',
      category: 'Chain',
      metal: 'Silver',
      purity: '925',
      grossWeight: 20,
      netWeight: 20,
      makingCharges: 0,
      stockQty: 0,
      imagePath: '',
    })

    const draft = await ipc<{ id: number; status: string }>(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: '2026-09-29',
      items: [
        { productId: gold.id, metal: 'Gold', category: 'Stud', purity: '22K', qty: 2, netWeight: 2, rate: 100 },
        { productId: silver.id, metal: 'Silver', category: 'Chain', purity: '925', qty: 3, netWeight: 20, rate: 1 },
      ],
    })
    expect(draft.status).toBe('draft')

    const finalized = await ipc<{ status: string }>(IPC_CHANNELS.INWARDS_FINALIZE, draft.id)
    expect(finalized.status).toBe('final')

    const goldAfter = await ipc<{ stockQty: number; huids: string[] }>(IPC_CHANNELS.PRODUCTS_GET, gold.id)
    expect(goldAfter.stockQty).toBe(2)
    expect(goldAfter.huids).toEqual([])
    const silverAfter = await ipc<{ stockQty: number; huids: string[] }>(IPC_CHANNELS.PRODUCTS_GET, silver.id)
    expect(silverAfter.stockQty).toBe(3)
    expect(silverAfter.huids).toEqual([])
  })

  it('numbers a purchase from its own date and renumbers a draft moved to another year', async () => {
    const supplier = await ipc<{ id: number }>(IPC_CHANNELS.SUPPLIERS_CREATE, {
      name: 'Year Supplier',
      phone: '',
      address: '',
      notes: '',
    })
    const line = { metal: 'Gold', category: 'Chain', purity: '22K', qty: 1, netWeight: 1, rate: 0 }
    const older = await ipc<{ id: number; inwardNo: string }>(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: '2025-12-31',
      items: [line],
    })
    expect(older.inwardNo).toMatch(/^IN-2025-\d{4}$/)

    const moved = await ipc<{ inwardNo: string }>(IPC_CHANNELS.INWARDS_UPDATE, {
      id: older.id,
      supplierId: supplier.id,
      inwardDate: '2024-06-01',
      items: [line],
    })
    expect(moved.inwardNo).toBe('IN-2024-0001')

    const listed = await ipc<Array<{ id: number; items: unknown[] }>>(IPC_CHANNELS.INWARDS_LIST)
    expect(listed.find((row) => row.id === older.id)?.items).toHaveLength(1)
  })

  it('closes a metal day into a snapshot and blocks further finalize', async () => {
    const stockDate = '2026-09-26'
    await ipc(IPC_CHANNELS.STOCK_UPSERT, {
      stockDate,
      metal: 'Gold',
      itemName: 'Ring',
      openingWeight: 20,
    })

    const closed = await ipc<{ status: string; rows: Array<{ itemName: string; closingWeight: number }> }>(
      IPC_CHANNELS.STOCK_DAY_CLOSING_CLOSE,
      {
        businessDate: stockDate,
        metal: 'Gold',
        operatorName: 'admin',
        note: 'evening close',
      },
    )
    expect(closed.status).toBe('closed')
    expect(closed.rows.find((row) => row.itemName === 'Ring')?.closingWeight).toBe(20)

    const supplier = await ipc<{ id: number }>(IPC_CHANNELS.SUPPLIERS_CREATE, {
      name: 'Blocked Supplier',
      phone: '',
      address: '',
      notes: '',
    })
    const draft = await ipc<{ id: number }>(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: stockDate,
      items: [
        {
          metal: 'Gold',
          category: 'Ring',
          purity: '22K',
          qty: 1,
          netWeight: 1,
          rate: 0,
        },
      ],
    })

    await expect(ipc(IPC_CHANNELS.INWARDS_FINALIZE, draft.id)).rejects.toThrow(/closed/i)

    const reopened = await ipc<{ status: string }>(IPC_CHANNELS.STOCK_DAY_CLOSING_REOPEN, {
      businessDate: stockDate,
      metal: 'Gold',
      reason: 'Need to finalize missed inward',
    })
    expect(reopened.status).toBe('open')

    const finalized = await ipc<{ status: string }>(IPC_CHANNELS.INWARDS_FINALIZE, draft.id)
    expect(finalized.status).toBe('final')

    const rows = await ipc<Array<{ itemName: string; autoPurchaseIn: number }>>(IPC_CHANNELS.STOCK_LIST, {
      stockDate,
      metal: 'Gold',
    })
    expect(rows.find((row) => row.itemName === 'Ring')?.autoPurchaseIn).toBe(1)
  })

  it('blocks metal day close while an inward draft is open', async () => {
    const stockDate = '2026-09-27'
    const supplier = await ipc<{ id: number }>(IPC_CHANNELS.SUPPLIERS_CREATE, {
      name: 'Open Inward Supplier',
      phone: '',
      address: '',
      notes: '',
    })
    await ipc(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: stockDate,
      items: [
        {
          metal: 'Gold',
          category: 'Chain',
          purity: '22K',
          qty: 1,
          netWeight: 2,
          rate: 0,
        },
      ],
    })

    const precheck = await ipc<{ openDrafts: number; openInwards: number }>(
      IPC_CHANNELS.STOCK_DAY_CLOSING_PRECHECK,
      { businessDate: stockDate, metal: 'Gold' },
    )
    expect(precheck.openInwards).toBe(1)

    await expect(
      ipc(IPC_CHANNELS.STOCK_DAY_CLOSING_CLOSE, {
        businessDate: stockDate,
        metal: 'Gold',
        operatorName: 'admin',
      }),
    ).rejects.toThrow(/Cannot close/)
  })

  it('stores purchase invoice GST fields and keeps an old-style line total before tax', async () => {
    const supplier = await ipc<{ id: number; gstin: string }>(IPC_CHANNELS.SUPPLIERS_CREATE, {
      name: 'Invoice Supplier',
      phone: '9876501234',
      address: 'Salem',
      notes: '',
      gstin: '33ABCDE1234F1Z5',
    })
    expect(supplier.gstin).toBe('33ABCDE1234F1Z5')

    const oldStyle = await ipc<{
      id: number
      paymentMode: string
      subtotal: number
      cgst: number
      sgst: number
      total: number
      items: Array<{ lineTotal: number; hsnCode: string; makingCharges: number; grossWeight: number }>
    }>(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: '2026-09-28',
      notes: '',
      items: [
        {
          metal: 'Gold',
          category: 'Chain',
          purity: '22K',
          qty: 3,
          netWeight: 2,
          rate: 100,
        },
      ],
    })
    expect(oldStyle.items[0]?.lineTotal).toBe(600)
    expect(oldStyle.items[0]?.hsnCode).toBe('7113')
    expect(oldStyle.items[0]?.makingCharges).toBe(0)
    expect(oldStyle.items[0]?.grossWeight).toBe(0)
    expect(oldStyle.subtotal).toBe(600)
    expect(oldStyle.cgst).toBe(9)
    expect(oldStyle.sgst).toBe(9)
    expect(oldStyle.total).toBe(618)
    expect(oldStyle.paymentMode).toBe('cash')

    const withMaking = await ipc<{
      id: number
      paymentMode: string
      subtotal: number
      cgst: number
      sgst: number
      roundOff: number
      total: number
      items: Array<{ lineTotal: number; hsnCode: string; makingCharges: number; grossWeight: number }>
    }>(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      inwardDate: '2026-09-28',
      paymentMode: 'upi',
      notes: 'Checked',
      items: [
        {
          metal: 'Gold',
          category: 'Chain',
          purity: '22K',
          qty: 1,
          grossWeight: 8.5,
          netWeight: 8,
          rate: 100,
          makingCharges: 250,
          hsnCode: '7113',
        },
      ],
    })
    expect(withMaking.items[0]?.lineTotal).toBe(1050)
    expect(withMaking.items[0]?.grossWeight).toBe(8.5)
    expect(withMaking.items[0]?.makingCharges).toBe(250)
    expect(withMaking.paymentMode).toBe('upi')
    expect(withMaking.subtotal).toBe(1050)
    expect(withMaking.cgst).toBe(15.75)
    expect(withMaking.sgst).toBe(15.75)
    expect(withMaking.roundOff).toBe(0.5)
    expect(withMaking.total).toBe(1082)

    await ipc(IPC_CHANNELS.INWARDS_FINALIZE, withMaking.id)
    const gstPurchase = await ipc<{
      rows: Array<{ month: string; taxable: number; cgst: number; sgst: number; bills: number }>
    }>(IPC_CHANNELS.REPORTS_RUN, {
      id: 'gst-purchase',
      from: '2026-09-01',
      to: '2026-09-30',
    })
    const september = gstPurchase.rows.find((row) => row.month === '2026-09')
    expect(september?.bills).toBe(1)
    expect(september?.taxable).toBe(1050)
    expect(september?.cgst).toBe(15.75)
    expect(september?.sgst).toBe(15.75)
  })
})
