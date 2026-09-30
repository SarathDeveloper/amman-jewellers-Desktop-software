import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, ipc, invokeIpcForTests, useIntegrationEnv } from './helpers/testEnv'

const sampleCustomer = {
  name: 'Raja',
  phone: '9876543210',
  address: 'Salem',
  guardianName: 'Perumal',
  aadhaar: '123456789012',
  pan: 'ABCDE1234F',
}

describe('customers IPC', () => {
  useIntegrationEnv()

  it('creates, lists, updates, and deletes a customer', async () => {
    const created = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, sampleCustomer)
    expect(created.name).toBe(sampleCustomer.name)
    expect(created.guardianName).toBe(sampleCustomer.guardianName)
    expect(created.aadhaar).toBe(sampleCustomer.aadhaar)
    expect(created.pan).toBe(sampleCustomer.pan)

    const listed = await ipc(IPC_CHANNELS.CUSTOMERS_LIST)
    expect(listed).toHaveLength(1)

    const updated = await ipc(IPC_CHANNELS.CUSTOMERS_UPDATE, {
      id: created.id,
      input: { ...sampleCustomer, name: 'Raja Updated', pan: 'xyzab5678c' },
    })
    expect(updated.name).toBe('Raja Updated')
    expect(updated.pan).toBe('XYZAB5678C')

    await ipc(IPC_CHANNELS.CUSTOMERS_DELETE, created.id)
    const afterDelete = await ipc(IPC_CHANNELS.CUSTOMERS_LIST)
    expect(afterDelete).toHaveLength(0)
  })

  it('rejects invalid mobile numbers', async () => {
    const result = await invokeIpcForTests(IPC_CHANNELS.CUSTOMERS_CREATE, {
      ...sampleCustomer,
      phone: '12345',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/10 digits/i)
  })
})
