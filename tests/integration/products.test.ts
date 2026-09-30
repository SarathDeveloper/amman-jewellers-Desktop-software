import { describe, expect, it } from 'vitest'
import { invokeIpcForTests } from './helpers/testEnv'
import { IPC_CHANNELS, ipc, useIntegrationEnv } from './helpers/testEnv'

const sampleProduct = {
  name: 'Test chain',
  category: 'Chain',
  metal: 'Gold',
  purity: '22K',
  grossWeight: 10,
  netWeight: 9.5,
  makingCharges: 100,
  stockQty: 5,
  imagePath: '',
}

describe('products IPC', () => {
  useIntegrationEnv()

  it('creates, lists, updates, and deletes a product', async () => {
    const created = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    expect(created.name).toBe(sampleProduct.name)
    expect(created.imagePath).toBe('')

    const listed = await ipc(IPC_CHANNELS.PRODUCTS_LIST)
    expect(listed).toHaveLength(1)

    const updated = await ipc(IPC_CHANNELS.PRODUCTS_UPDATE, {
      id: created.id,
      input: { ...sampleProduct, name: 'Updated chain', stockQty: 8, imagePath: '/tmp/chain.jpg' },
    })
    expect(updated.name).toBe('Updated chain')
    expect(updated.stockQty).toBe(8)
    expect(updated.imagePath).toBe('/tmp/chain.jpg')

    await ipc(IPC_CHANNELS.PRODUCTS_DELETE, created.id)
    const afterDelete = await ipc(IPC_CHANNELS.PRODUCTS_LIST)
    expect(afterDelete).toHaveLength(0)
  })

  it('creates variants under a parent and lists them', async () => {
    const parent = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...sampleProduct,
      name: 'Gold Ring',
      category: 'Ring',
      stockQty: 0,
    })
    const variant = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...sampleProduct,
      name: 'Gold Ring',
      category: 'Ring',
      parentId: parent.id,
      variantCode: 'GR-2.5-16',
      size: '16',
      netWeight: 2.5,
      grossWeight: 2.7,
      stoneWeight: 0.2,
      stoneDetails: 'Ruby',
      attributes: { finish: 'Matt' },
      stockQty: 3,
    })
    expect(variant.parentId).toBe(parent.id)
    expect(variant.size).toBe('16')
    expect(variant.variantCode).toBe('GR-2.5-16')
    expect(variant.attributes.finish).toBe('Matt')

    const listed = await ipc<typeof variant[]>(IPC_CHANNELS.PRODUCTS_VARIANTS, parent.id)
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(variant.id)

    const byParent = await ipc<typeof variant[]>(IPC_CHANNELS.PRODUCTS_LIST)
    expect(byParent.filter((row) => row.parentId === parent.id)).toHaveLength(1)

    const blocked = await invokeIpcForTests(IPC_CHANNELS.PRODUCTS_DELETE, parent.id)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.error).toMatch(/variant/i)
    }

    await ipc(IPC_CHANNELS.PRODUCTS_DELETE, variant.id)
    await ipc(IPC_CHANNELS.PRODUCTS_DELETE, parent.id)
  })

  it('rejects a variant of a variant', async () => {
    const parent = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, { ...sampleProduct, name: 'Parent ring', category: 'Ring' })
    const child = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...sampleProduct,
      name: 'Child ring',
      category: 'Ring',
      parentId: parent.id,
    })
    const nested = await invokeIpcForTests(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...sampleProduct,
      name: 'Nested ring',
      category: 'Ring',
      parentId: child.id,
    })
    expect(nested.ok).toBe(false)
    if (!nested.ok) {
      expect(nested.error).toMatch(/cannot have their own variants/i)
    }
  })

  it('rejects net weight greater than gross weight', async () => {
    const result = await invokeIpcForTests(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...sampleProduct,
      name: 'Bad weights',
      grossWeight: 5,
      netWeight: 6,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/Net weight cannot exceed gross weight/i)
    }
  })

  it('adjusts piece stock through an adjustment document', async () => {
    const created = await ipc<{ id: number; stockQty: number }>(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    expect(created.stockQty).toBe(5)

    const added = await ipc<{ lines: Array<{ qtyDelta: number }> }>(IPC_CHANNELS.STOCK_ADJUSTMENT_CREATE, {
      adjustmentDate: '2026-09-28',
      reason: 'Stock addition',
      note: 'Count correction',
      lines: [
        {
          productId: created.id,
          metal: 'Gold',
          category: 'Chain',
          qtyDelta: 3,
          weightDelta: 28.5,
        },
      ],
    })
    expect(added.lines[0].qtyDelta).toBe(3)

    const afterAdd = await ipc<{ stockQty: number }>(IPC_CHANNELS.PRODUCTS_GET, created.id)
    expect(afterAdd.stockQty).toBe(8)

    await ipc(IPC_CHANNELS.STOCK_ADJUSTMENT_CREATE, {
      adjustmentDate: '2026-09-28',
      reason: 'Stock reduction',
      lines: [
        {
          productId: created.id,
          metal: 'Gold',
          category: 'Chain',
          qtyDelta: -2,
          weightDelta: -19,
        },
      ],
    })
    const afterReduce = await ipc<{ stockQty: number }>(IPC_CHANNELS.PRODUCTS_GET, created.id)
    expect(afterReduce.stockQty).toBe(6)
  })
})
