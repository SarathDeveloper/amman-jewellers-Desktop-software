import { describe, expect, it } from 'vitest'
import { getDatabase } from '../../server/db'
import {
  countSeededGoldSavingAccounts,
  countSeededGoldSavingSchemes,
  countSeededInvoices,
  seedSampleDashboardIfEmpty,
  seedSampleDataIfEmpty,
  seedSampleGoldSavingsIfEmpty,
} from '../../server/db/sampleData'
import { IPC_CHANNELS, ipc, useIntegrationEnv, withHuids } from './helpers/testEnv'

describe('sample data seed helpers', () => {
  useIntegrationEnv()

  it('seeds catalogue and dashboard demo on an empty database', async () => {
    const db = getDatabase()
    expect(seedSampleDataIfEmpty(db)).toBe(true)
    expect(seedSampleDashboardIfEmpty(db)).toBe(true)
    expect(seedSampleGoldSavingsIfEmpty(db)).toBe(true)
    expect(countSeededInvoices(db)).toBe(32)
    expect(countSeededGoldSavingSchemes(db)).toBe(2)
    expect(countSeededGoldSavingAccounts(db)).toBe(5)

    const products = await ipc(IPC_CHANNELS.PRODUCTS_LIST)
    const customers = await ipc(IPC_CHANNELS.CUSTOMERS_LIST)
    const invoices = await ipc(IPC_CHANNELS.INVOICES_LIST)
    expect(products).toHaveLength(10)
    expect(customers.length).toBeGreaterThanOrEqual(16)
    expect(invoices).toHaveLength(32)

    const accounts = db
      .prepare(`SELECT c.name AS name, a.status AS status FROM gold_saving_accounts a JOIN customers c ON c.id = a.customer_id ORDER BY a.id`)
      .all() as { name: string; status: string }[]
    expect(accounts.map((row) => row.name)).toEqual(['Ravi Kumar', 'Priya', 'Suresh', 'Meena', 'Kumar'])
    expect(accounts.find((row) => row.name === 'Kumar')?.status).toBe('cancelled')
    expect(accounts.find((row) => row.name === 'Meena')?.status).toBe('matured')
  })

  it('seeds dashboard demo when catalogue already exists', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Demo ring',
      category: 'Ring',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 4,
      netWeight: 3.5,
      makingCharges: 500,
      stockQty: 5,
      imagePath: '',
    }))
    await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Ravi Kumar',
      phone: '9000000001',
      address: 'Salem',
      notes: '',
    })

    const db = getDatabase()
    expect(seedSampleDataIfEmpty(db)).toBe(false)
    expect(seedSampleDashboardIfEmpty(db)).toBe(true)
    expect(countSeededInvoices(db)).toBe(32)

    const ledger = await ipc<{ totalOutstanding: number }>(IPC_CHANNELS.DUES_LIST)
    expect(ledger.totalOutstanding).toBe(38500)
  })

  it('does not seed when bills already exist', async () => {
    const db = getDatabase()
    expect(seedSampleDataIfEmpty(db)).toBe(true)
    expect(seedSampleDashboardIfEmpty(db)).toBe(true)
    expect(seedSampleGoldSavingsIfEmpty(db)).toBe(true)
    expect(seedSampleDataIfEmpty(db)).toBe(false)
    expect(seedSampleDashboardIfEmpty(db)).toBe(false)
    expect(seedSampleGoldSavingsIfEmpty(db)).toBe(false)
  })
})
