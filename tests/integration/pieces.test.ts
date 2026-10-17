import { describe, expect, it } from 'vitest'
import { getDatabase } from '../../server/db'
import {
  getTestAgent,
  IPC_CHANNELS,
  ipc,
  invokeIpcForTests,
  testHuids,
  useIntegrationEnv,
  withHuids,
} from './helpers/testEnv'

const PURCHASE_DATE = '2026-09-24'

type Piece = {
  id: number
  productId: number
  tagCode: string
  huid: string
  grossWeight: number
  stoneWeight: number
  netWeight: number
  status: string
  invoiceId: number | null
}

async function createSupplier() {
  return ipc<{ id: number }>(IPC_CHANNELS.SUPPLIERS_CREATE, {
    name: 'Piece Supplier',
    phone: '',
    address: '',
    notes: '',
  })
}

async function createTrackedProduct(name: string) {
  return ipc<{ id: number; stockQty: number; trackPieces: boolean }>(IPC_CHANNELS.PRODUCTS_CREATE, {
    name,
    category: 'Ring',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 0,
    netWeight: 0,
    makingCharges: 200,
    stockQty: 0,
    imagePath: '',
    huids: [],
    trackPieces: true,
  })
}

async function piecesOf(productId: number): Promise<Piece[]> {
  const response = await getTestAgent().get(`/api/products/${productId}/pieces`)
  expect(response.status).toBe(200)
  return response.body as Piece[]
}

async function inStockPieces(productId: number): Promise<Piece[]> {
  const response = await getTestAgent().get(`/api/products/${productId}/pieces?status=in_stock`)
  expect(response.status).toBe(200)
  return response.body as Piece[]
}

async function buyPieces(
  supplierId: number,
  productId: number,
  rows: Array<{ huid?: string; netWeight: number }>,
  options: { supplierInvoiceNo?: string; finalize?: boolean } = {},
): Promise<{ id: number }> {
  const inward = await ipc<{ id: number }>(IPC_CHANNELS.INWARDS_CREATE, {
    supplierId,
    supplierInvoiceNo: options.supplierInvoiceNo ?? '',
    inwardDate: PURCHASE_DATE,
    notes: '',
    items: [
      {
        productId,
        metal: 'Gold',
        category: 'Ring',
        purity: '22K',
        qty: rows.length,
        grossWeight: rows.reduce((sum, row) => sum + row.netWeight, 0) / rows.length,
        netWeight: rows.reduce((sum, row) => sum + row.netWeight, 0) / rows.length,
        rate: 1000,
        makingCharges: 200,
        huids: rows.map((row) => row.huid ?? '').filter(Boolean),
        pieces: rows.map((row) => ({
          huid: row.huid ?? '',
          grossWeight: row.netWeight,
          stoneWeight: 0,
          netWeight: row.netWeight,
        })),
      },
    ],
  })
  if (options.finalize !== false) {
    await ipc(IPC_CHANNELS.INWARDS_FINALIZE, inward.id)
  }
  return inward
}

async function createCustomer() {
  return ipc<{ id: number }>(IPC_CHANNELS.CUSTOMERS_CREATE, {
    name: 'Piece Buyer',
    phone: '9876543210',
    address: 'Salem',
    notes: '',
  })
}

function pieceBill(
  customerId: number,
  productId: number,
  piece: Piece,
  options: { netWeight?: number } = {},
) {
  return {
    customerId,
    invoiceDate: PURCHASE_DATE,
    tax: 0,
    autoTax: false,
    items: [
      {
        productId,
        qty: 1,
        rate: 1000,
        metalRate: 1000,
        grossWeight: piece.netWeight,
        netWeight: options.netWeight ?? piece.netWeight,
        stoneWeight: 0,
        huid: piece.huid,
        pieceId: piece.id,
      },
    ],
  }
}

describe('piece-level inventory', () => {
  useIntegrationEnv()

  it('creates each opening piece from the weights entered on the product', async () => {
    const [first, second] = testHuids(2)
    const product = await ipc<{ id: number; stockQty: number; huids: string[] }>(
      IPC_CHANNELS.PRODUCTS_CREATE,
      {
        name: 'Opening ring',
        category: 'Ring',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 5.2,
        netWeight: 1,
        makingCharges: 0,
        stockQty: 2,
        imagePath: '',
        huids: [first],
        trackPieces: true,
        pieces: [
          { huid: first, grossWeight: 5.2, stoneWeight: 0.2, netWeight: 5 },
          { huid: second, grossWeight: 6.4, stoneWeight: 0.4, netWeight: 6 },
        ],
      },
    )
    expect(product.stockQty).toBe(2)
    expect(product.huids).toEqual([first, second])
    const pieces = await inStockPieces(product.id)
    expect(pieces.map((piece) => piece.grossWeight)).toEqual([5.2, 6.4])
    expect(pieces.map((piece) => piece.stoneWeight)).toEqual([0.2, 0.4])
    expect(pieces.map((piece) => piece.netWeight)).toEqual([5, 6])
    expect(pieces.map((piece) => piece.huid)).toEqual([first, second])
    const opening = getDatabase()
      .prepare(
        `SELECT weight_delta AS weight FROM stock_movements
         WHERE product_id = ? AND movement_type = 'opening'`,
      )
      .get(product.id) as { weight: number }
    expect(opening.weight).toBe(11)
  })

  it('creates one tagged piece per purchase row and keeps the count in sync', async () => {
    const supplier = await createSupplier()
    const product = await createTrackedProduct('Tracked ring')
    expect(product.trackPieces).toBe(true)
    expect(product.stockQty).toBe(0)

    const huids = testHuids(2)
    await buyPieces(supplier.id, product.id, [
      { huid: huids[0], netWeight: 2 },
      { huid: huids[1], netWeight: 3 },
    ])

    const pieces = await inStockPieces(product.id)
    expect(pieces).toHaveLength(2)
    expect(pieces.map((piece) => piece.netWeight)).toEqual([2, 3])
    expect(pieces.map((piece) => piece.huid)).toEqual(huids)
    expect(pieces.every((piece) => piece.tagCode.startsWith('T'))).toBe(true)

    const after = await ipc<{ stockQty: number; huids: string[] }>(
      IPC_CHANNELS.PRODUCTS_GET,
      product.id,
    )
    expect(after.stockQty).toBe(2)
    expect(after.huids).toEqual(huids)
  })

  it('rejects a second finalize of the same purchase', async () => {
    const supplier = await createSupplier()
    const product = await createTrackedProduct('Finalize once ring')
    const inward = await buyPieces(supplier.id, product.id, [{ netWeight: 2 }])

    const again = await invokeIpcForTests(IPC_CHANNELS.INWARDS_FINALIZE, inward.id)
    expect(again.ok).toBe(false)
    expect(again.error).toMatch(/Only draft inwards/i)

    const pieces = await inStockPieces(product.id)
    expect(pieces).toHaveLength(1)
  })

  it('stores a HUID typed at sale on a piece that had none, and keeps it after cancel', async () => {
    const supplier = await createSupplier()
    const customer = await createCustomer()
    const product = await createTrackedProduct('Untagged ring')
    const [typed] = testHuids(1)
    await buyPieces(supplier.id, product.id, [{ netWeight: 5 }])
    const [piece] = await inStockPieces(product.id)
    expect(piece.huid).toBe('')

    const draft = await ipc<{ id: number; items: Array<{ huid: string; pieceHuid: string }> }>(
      IPC_CHANNELS.INVOICES_CREATE,
      pieceBill(customer.id, product.id, { ...piece, huid: typed }),
    )
    expect(draft.items[0].huid).toBe(typed)
    expect(draft.items[0].pieceHuid).toBe('')

    await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)
    const sold = await piecesOf(product.id)
    expect(sold.find((row) => row.id === piece.id)?.huid).toBe(typed)

    await ipc(IPC_CHANNELS.INVOICES_CANCEL, { id: draft.id, reason: 'Wrong tag' })
    const restored = await inStockPieces(product.id)
    expect(restored.find((row) => row.id === piece.id)?.huid).toBe(typed)
    const after = await ipc<{ huids: string[] }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(after.huids).toEqual([typed])
  })

  it('refuses a different HUID on a piece that already has one', async () => {
    const supplier = await createSupplier()
    const customer = await createCustomer()
    const product = await createTrackedProduct('Tagged ring')
    const [existing, other] = testHuids(2)
    await buyPieces(supplier.id, product.id, [{ huid: existing, netWeight: 5 }])
    const [piece] = await inStockPieces(product.id)

    const rejected = await invokeIpcForTests(
      IPC_CHANNELS.INVOICES_CREATE,
      pieceBill(customer.id, product.id, { ...piece, huid: other }),
    )
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toMatch(/already has HUID/i)
  })

  it('sells the exact piece, refuses it twice, and restores it when the bill is cancelled', async () => {
    const supplier = await createSupplier()
    const customer = await createCustomer()
    const product = await createTrackedProduct('Sell one ring')
    await buyPieces(supplier.id, product.id, [{ netWeight: 2 }, { netWeight: 3 }])
    const [first] = await inStockPieces(product.id)

    const draft = await ipc<{ id: number }>(
      IPC_CHANNELS.INVOICES_CREATE,
      pieceBill(customer.id, product.id, first),
    )
    await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)

    const sold = await piecesOf(product.id)
    expect(sold.find((piece) => piece.id === first.id)?.status).toBe('sold')
    const afterSale = await ipc<{ stockQty: number }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(afterSale.stockQty).toBe(1)

    const secondBill = await invokeIpcForTests(
      IPC_CHANNELS.INVOICES_CREATE,
      pieceBill(customer.id, product.id, first),
    )
    expect(secondBill.ok).toBe(false)
    expect(secondBill.error).toMatch(/sold/i)

    await ipc(IPC_CHANNELS.INVOICES_CANCEL, { id: draft.id, reason: 'Wrong tag' })
    const restored = await piecesOf(product.id)
    expect(restored.find((piece) => piece.id === first.id)?.status).toBe('in_stock')
    const afterCancel = await ipc<{ stockQty: number }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(afterCancel.stockQty).toBe(2)
  })

  it('cancels a finalized purchase and reverses its pieces', async () => {
    const supplier = await createSupplier()
    const product = await createTrackedProduct('Cancel purchase ring')
    const inward = await buyPieces(supplier.id, product.id, [{ netWeight: 2 }])

    const response = await getTestAgent()
      .post(`/api/inwards/${inward.id}/cancel`)
      .send({ reason: 'Supplier invoice was wrong' })
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('cancelled')

    const pieces = await piecesOf(product.id)
    expect(pieces).toHaveLength(1)
    expect(pieces[0].status).toBe('reversed')
    const after = await ipc<{ stockQty: number }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(after.stockQty).toBe(0)
  })

  it('blocks cancelling a purchase after one of its pieces is sold', async () => {
    const supplier = await createSupplier()
    const customer = await createCustomer()
    const product = await createTrackedProduct('Cancel after sale ring')
    const inward = await buyPieces(supplier.id, product.id, [{ netWeight: 2 }])
    const [piece] = await inStockPieces(product.id)

    const draft = await ipc<{ id: number }>(
      IPC_CHANNELS.INVOICES_CREATE,
      pieceBill(customer.id, product.id, piece),
    )
    await ipc(IPC_CHANNELS.INVOICES_FINALIZE, draft.id)

    const blocked = await getTestAgent()
      .post(`/api/inwards/${inward.id}/cancel`)
      .send({ reason: 'Trying to undo' })
    expect(blocked.status).toBeGreaterThanOrEqual(400)
    expect(blocked.body.error).toMatch(/Cancel that bill first/i)

    await ipc(IPC_CHANNELS.INVOICES_CANCEL, { id: draft.id, reason: 'Undo sale' })
    const cancelled = await getTestAgent()
      .post(`/api/inwards/${inward.id}/cancel`)
      .send({ reason: 'Supplier invoice was wrong' })
    expect(cancelled.status).toBe(200)
  })

  it('converts an existing product to piece tracking without changing its count or HUIDs', async () => {
    const product = await ipc<{ id: number; stockQty: number; huids: string[] }>(
      IPC_CHANNELS.PRODUCTS_CREATE,
      withHuids({
        name: 'Legacy stock ring',
        category: 'Ring',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 3,
        netWeight: 2.5,
        makingCharges: 0,
        stockQty: 2,
        imagePath: '',
      }),
    )

    const response = await getTestAgent().post(`/api/products/${product.id}/track-pieces`)
    expect(response.status).toBe(200)
    expect(response.body.trackPieces).toBe(true)
    expect(response.body.stockQty).toBe(2)
    expect(response.body.huids).toEqual(product.huids)

    const pieces = await inStockPieces(product.id)
    expect(pieces).toHaveLength(2)
    expect(pieces.map((piece) => piece.huid)).toEqual(product.huids)
  })

  it('requires a tag row when selling a tracked product', async () => {
    const supplier = await createSupplier()
    const customer = await createCustomer()
    const product = await createTrackedProduct('No tag ring')
    await buyPieces(supplier.id, product.id, [{ netWeight: 2 }])

    const result = await invokeIpcForTests(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: PURCHASE_DATE,
      tax: 0,
      autoTax: false,
      items: [{ productId: product.id, qty: 1, rate: 1000, metalRate: 1000, netWeight: 2 }],
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/tracks each piece/i)
  })

  it('rejects a duplicate supplier invoice number on the same supplier', async () => {
    const supplier = await createSupplier()
    const product = await createTrackedProduct('Invoice number ring')
    await buyPieces(supplier.id, product.id, [{ netWeight: 2 }], {
      supplierInvoiceNo: 'SUP-1001',
      finalize: false,
    })

    const duplicate = await invokeIpcForTests(IPC_CHANNELS.INWARDS_CREATE, {
      supplierId: supplier.id,
      supplierInvoiceNo: 'SUP-1001',
      inwardDate: PURCHASE_DATE,
      notes: '',
      items: [
        {
          productId: product.id,
          metal: 'Gold',
          category: 'Ring',
          purity: '22K',
          qty: 1,
          netWeight: 2,
          rate: 1000,
        },
      ],
    })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.error).toMatch(/already recorded/i)
  })

  it('reports the piece register', async () => {
    const supplier = await createSupplier()
    const product = await createTrackedProduct('Report ring')
    await buyPieces(supplier.id, product.id, [{ netWeight: 2 }])

    const report = await ipc<{ rows: Array<Record<string, string | number>> }>(
      IPC_CHANNELS.REPORTS_RUN,
      { id: 'piece-register' },
    )
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].product).toBe('Report ring')
    expect(report.rows[0].status).toBe('in stock')
  })

  it('copies a cancelled purchase with each piece weight and a fresh tag', async () => {
    const supplier = await createSupplier()
    const product = await createTrackedProduct('Copy weights ring')
    const inward = await buyPieces(supplier.id, product.id, [
      { netWeight: 2.25 },
      { netWeight: 4.5 },
    ])

    const cancelled = await getTestAgent()
      .post(`/api/inwards/${inward.id}/cancel`)
      .send({ reason: 'Wrong weights entered' })
    expect(cancelled.status).toBe(200)

    const copy = await getTestAgent().post(`/api/inwards/${inward.id}/copy`)
    expect(copy.status).toBe(201)
    const pieces = copy.body.items[0].pieces as Array<{ netWeight: number; huid: string; tagCode: string }>
    expect(pieces.map((piece) => piece.netWeight)).toEqual([2.25, 4.5])
    expect(pieces.every((piece) => piece.huid === '' && piece.tagCode === '')).toBe(true)
  })

  it('reduces tracked stock only by naming the piece', async () => {
    const supplier = await createSupplier()
    const product = await createTrackedProduct('Damaged ring')
    await buyPieces(supplier.id, product.id, [{ netWeight: 2 }, { netWeight: 3 }])
    const [piece] = await inStockPieces(product.id)

    const missing = await invokeIpcForTests(IPC_CHANNELS.STOCK_ADJUSTMENT_CREATE, {
      adjustmentDate: PURCHASE_DATE,
      reason: 'Stock reduction',
      lines: [
        {
          productId: product.id,
          metal: 'Gold',
          category: 'Ring',
          qtyDelta: -1,
          weightDelta: -2,
        },
      ],
    })
    expect(missing.ok).toBe(false)
    expect(missing.error).toMatch(/Select 1 piece/i)

    await ipc(IPC_CHANNELS.STOCK_ADJUSTMENT_CREATE, {
      adjustmentDate: PURCHASE_DATE,
      reason: 'Stock reduction',
      lines: [
        {
          productId: product.id,
          metal: 'Gold',
          category: 'Ring',
          qtyDelta: -1,
          weightDelta: -piece.netWeight,
          reason: 'damaged',
          pieceIds: [piece.id],
        },
      ],
    })

    const after = await piecesOf(product.id)
    expect(after.find((row) => row.id === piece.id)?.status).toBe('damaged')
    const productAfter = await ipc<{ stockQty: number }>(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(productAfter.stockQty).toBe(1)
  })
})
