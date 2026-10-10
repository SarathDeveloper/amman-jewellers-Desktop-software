import { describe, expect, it } from 'vitest'
import { invokeIpcForTests, testHuids, withHuids } from './helpers/testEnv'
import { IPC_CHANNELS, ipc, useIntegrationEnv } from './helpers/testEnv'

const sampleProduct = withHuids({
  name: 'Test chain',
  category: 'Chain',
  metal: 'Gold',
  purity: '22K',
  grossWeight: 10,
  netWeight: 9.5,
  makingCharges: 100,
  stockQty: 5,
  imagePath: '',
})

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
      input: withHuids({ ...sampleProduct, name: 'Updated chain', stockQty: 8, imagePath: '/tmp/chain.jpg' }),
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
      huids: [],
    })
    const variant = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...withHuids({
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
      }),
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
    const parent = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({ ...sampleProduct, name: 'Parent ring', category: 'Ring' }))
    const child = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      ...sampleProduct,
      name: 'Child ring',
      category: 'Ring',
      parentId: parent.id,
    }))
    const nested = await invokeIpcForTests(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      ...sampleProduct,
      name: 'Nested ring',
      category: 'Ring',
      parentId: child.id,
    }))
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
          huids: testHuids(3),
        },
      ],
    })
    expect(added.lines[0].qtyDelta).toBe(3)

    const afterAdd = await ipc<{ stockQty: number; huids: string[] }>(IPC_CHANNELS.PRODUCTS_GET, created.id)
    expect(afterAdd.stockQty).toBe(8)
    expect(afterAdd.huids).toHaveLength(8)

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
          huids: afterAdd.huids.slice(0, 2),
        },
      ],
    })
    const afterReduce = await ipc<{ stockQty: number; huids: string[] }>(IPC_CHANNELS.PRODUCTS_GET, created.id)
    expect(afterReduce.stockQty).toBe(6)
    expect(afterReduce.huids).toHaveLength(6)
    expect(afterReduce.huids).not.toContain(afterAdd.huids[0])
    expect(afterReduce.huids).not.toContain(afterAdd.huids[1])

    await ipc(IPC_CHANNELS.STOCK_ADJUSTMENT_CREATE, {
      adjustmentDate: '2026-09-28',
      reason: 'Stock addition',
      lines: [
        {
          productId: created.id,
          metal: 'Gold',
          category: 'Chain',
          qtyDelta: 1,
          weightDelta: 9.5,
        },
      ],
    })
    const afterUntaggedAdd = await ipc<{ stockQty: number; huids: string[] }>(
      IPC_CHANNELS.PRODUCTS_GET,
      created.id,
    )
    expect(afterUntaggedAdd.stockQty).toBe(7)
    expect(afterUntaggedAdd.huids).toHaveLength(6)
  })

  it('stores unique per-piece HUIDs and rejects duplicates', async () => {
    const created = await ipc<{ id: number; huids: string[] }>(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...sampleProduct,
      name: 'Hallmarked chain',
      stockQty: 2,
      huids: ['a1b2c3', 'D4E5F6'],
    })
    expect(created.huids).toEqual(['A1B2C3', 'D4E5F6'])

    const listed = await ipc<Array<{ id: number; huids: string[] }>>(IPC_CHANNELS.PRODUCTS_LIST, 'A1B2C3')
    expect(listed.some((row) => row.id === created.id)).toBe(true)

    const updated = await ipc<{ huids: string[] }>(IPC_CHANNELS.PRODUCTS_UPDATE, {
      id: created.id,
      input: { ...sampleProduct, name: 'Hallmarked chain', stockQty: 1, huids: ['D4E5F6'] },
    })
    expect(updated.huids).toEqual(['D4E5F6'])

    const partlyTagged = await ipc<{ huids: string[] }>(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...sampleProduct,
      name: 'Partly tagged chain',
      stockQty: 2,
      huids: ['ZZZZZ1'],
    })
    expect(partlyTagged.huids).toEqual(['ZZZZZ1'])

    const tooMany = await invokeIpcForTests(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...sampleProduct,
      name: 'Over-tagged chain',
      stockQty: 1,
      huids: ['ZZZZZ2', 'ZZZZZ3'],
    })
    expect(tooMany.ok).toBe(false)
    if (!tooMany.ok) {
      expect(tooMany.error).toMatch(/more HUIDs than pieces/)
    }

    const duplicate = await invokeIpcForTests(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...sampleProduct,
      name: 'Second chain',
      stockQty: 1,
      huids: ['D4E5F6'],
    })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) {
      expect(duplicate.error).toMatch(/HUID D4E5F6 is already used by Hallmarked chain/)
    }

    await ipc(IPC_CHANNELS.PRODUCTS_DELETE, created.id)
    const reused = await ipc<{ huids: string[] }>(IPC_CHANNELS.PRODUCTS_CREATE, {
      ...sampleProduct,
      name: 'Reused chain',
      stockQty: 1,
      huids: ['D4E5F6'],
    })
    expect(reused.huids).toEqual(['D4E5F6'])
  })
})
