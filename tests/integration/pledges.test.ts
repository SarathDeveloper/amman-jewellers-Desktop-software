import { describe, expect, it } from 'vitest'
import { getDatabase } from '../../server/db'
import { setShopSetting } from '../../server/lib/settingsStore'
import { getTestAgent, ipc, IPC_CHANNELS, useIntegrationEnv, withHuids } from './helpers/testEnv'

async function createPledgeCustomer(name: string, phone: string): Promise<number> {
  const customer = await ipc<{ id: number }>(IPC_CHANNELS.CUSTOMERS_CREATE, {
    name,
    phone,
    address: 'Salem',
    notes: '',
  })
  return customer.id
}

function goldItem(description: string, overrides: Record<string, unknown> = {}) {
  return {
    description,
    metal: 'Gold',
    purity: '22K',
    grossWeight: 10,
    netWeight: 9.5,
    pieces: 1,
    ...overrides,
  }
}

async function createDraftPledge(customerId: number, items: Array<Record<string, unknown>>) {
  return getTestAgent().post('/api/pledges').send({
    customerId,
    pledgeDate: '2026-08-01',
    assessedValue: 40000,
    loanAmount: 20000,
    interestPct: 2,
    items,
  })
}

function countRows(table: 'pledges' | 'pledge_items', where = '', params: unknown[] = []): number {
  const db = getDatabase()
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ${table}${where ? ` WHERE ${where}` : ''}`)
    .get(...params) as { n: number }
  return row.n
}

function dropTrigger(name: string): void {
  getDatabase().exec(`DROP TRIGGER IF EXISTS ${name}`)
}

describe('pledges API', () => {
  useIntegrationEnv()

  it('previews the next ADG receipt number then allocates it on create', async () => {
    const preview = await getTestAgent().get('/api/pledges/next-receipt-no')
    expect(preview.status).toBe(200)
    expect(preview.body.receiptNo).toMatch(/^ADG\d{4,}$/)

    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Preview Customer',
      phone: '9000000099',
      address: 'Salem',
      notes: '',
    })
    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-09-26',
      assessedValue: 10000,
      loanAmount: 5000,
      interestPct: 2.1,
      repaymentDueDate: '2026-10-26',
      items: [
        {
          description: 'Chain',
          metal: 'Gold',
          purity: '22K',
          grossWeight: 5,
          netWeight: 5,
          pieces: 1,
        },
      ],
    })
    expect(created.status).toBe(201)
    expect(created.body.receiptNo).toBe(preview.body.receiptNo)
    expect(created.body.status).toBe('draft')

    const next = await getTestAgent().get('/api/pledges/next-receipt-no')
    expect(next.status).toBe(200)
    expect(next.body.receiptNo).not.toBe(preview.body.receiptNo)
    expect(next.body.receiptNo).toMatch(/^ADG\d{4,}$/)
  })

  it('creates, updates, and redeems an Adagu pledge without touching product stock', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Pledge Customer',
      phone: '9000000001',
      address: 'Karumanthurai',
      guardianName: 'Perumal',
      notes: '',
    })
    const product = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Shop Ring',
      category: 'Ring',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 5,
      netWeight: 4,
      makingCharges: 0,
      stockQty: 10,
      imagePath: '',
    }))

    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-09-26',
      pledgeType: 'GOLD JEWELLERY',
      guardianName: 'Perumal',
      customerAddress: 'Karumanthurai',
      assessedValue: 50000,
      loanAmount: 15000,
      charges: 300,
      interestPct: 2.1,
      repaymentDueDate: '2026-10-26',
      notes: 'Rate fixed at 2.1% per month',
      items: [
        {
          description: 'Gold chain',
          identification: 'Hallmark JAS',
          metal: 'Gold',
          purity: '22K',
          grossWeight: 12,
          stoneWeight: 0.5,
          netWeight: 11.5,
          pieces: 1,
        },
      ],
    })

    expect(created.status).toBe(201)
    expect(created.body.receiptNo).toMatch(/^ADG\d{4,}$/)
    expect(created.body.status).toBe('draft')
    expect(created.body.pledgeType).toBe('GOLD JEWELLERY')
    expect(created.body.guardianName).toBe('Perumal')
    expect(created.body.customerAddress).toBe('Karumanthurai')
    expect(created.body.charges).toBe(300)
    expect(created.body.repaymentDueDate).toBe('2026-10-26')
    expect(created.body.items).toHaveLength(1)
    expect(created.body.items[0].identification).toBe('Hallmark JAS')
    expect(created.body.items[0].stoneWeight).toBe(0.5)

    const updated = await getTestAgent()
      .put(`/api/pledges/${created.body.id}`)
      .send({
        id: created.body.id,
        customerId: customer.id,
        pledgeDate: '2026-09-26',
        pledgeType: 'GOLD JEWELLERY',
        guardianName: 'Perumal',
        customerAddress: 'Karumanthurai',
        assessedValue: 52000,
        loanAmount: 15500,
        charges: 300,
        interestPct: 2.1,
        repaymentDueDate: '2026-10-26',
        notes: 'Updated',
        items: [
          {
            description: 'Gold chain',
            identification: 'Hallmark JAS',
            metal: 'Gold',
            purity: '22K',
            grossWeight: 12,
            stoneWeight: 0.5,
            netWeight: 11.5,
            pieces: 1,
          },
          {
            description: 'Gold stud',
            identification: '',
            metal: 'Gold',
            purity: '22K',
            grossWeight: 2,
            stoneWeight: 0.2,
            netWeight: 1.8,
            pieces: 2,
          },
        ],
      })
    expect(updated.status).toBe(200)
    expect(updated.body.status).toBe('draft')
    expect(updated.body.loanAmount).toBe(15500)
    expect(updated.body.items).toHaveLength(2)

    const sanctioned = await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)
    expect(sanctioned.status).toBe(200)
    expect(sanctioned.body.status).toBe('active')

    const redeemed = await getTestAgent()
      .post(`/api/pledges/${created.body.id}/redeem`)
      .send({
        id: created.body.id,
        redeemedDate: '2026-10-01',
        amountCollected: 15825.5,
      })
    expect(redeemed.status).toBe(200)
    expect(redeemed.body.status).toBe('redeemed')
    expect(redeemed.body.amountCollected).toBe(15825.5)

    const editBlocked = await getTestAgent()
      .put(`/api/pledges/${created.body.id}`)
      .send({
        id: created.body.id,
        customerId: customer.id,
        pledgeDate: '2026-09-26',
        assessedValue: 52000,
        loanAmount: 15500,
        interestPct: 2.1,
        items: [
          {
            description: 'Gold chain',
            metal: 'Gold',
            purity: '22K',
            grossWeight: 12,
            netWeight: 11.5,
            pieces: 1,
          },
        ],
      })
    expect(editBlocked.status).toBe(400)

    const productAfter = await ipc(IPC_CHANNELS.PRODUCTS_GET, product.id)
    expect(productAfter.stockQty).toBe(10)

    const list = await getTestAgent().get('/api/pledges')
    expect(list.status).toBe(200)
    expect(list.body.items.some((row: { id: number }) => row.id === created.body.id)).toBe(true)
  })

  it('assigns separate CB and TI invoice number prefixes', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Prefix Customer',
      phone: '9000000002',
      address: 'Salem',
      notes: '',
    })
    const product = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Prefix Item',
      category: 'Ring',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 5,
      netWeight: 4,
      makingCharges: 0,
      stockQty: 5,
      imagePath: '',
    }))

    const cash = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-26',
      tax: 0,
      autoTax: false,
      billFormat: 'cash_bill',
      items: [
        { productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2, huid: product.huids[0] },
      ],
    })
    const cashFinal = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, cash.id)
    expect(cashFinal.invoiceNo).toMatch(/^CB-\d{4}-\d{4}$/)

    const tax = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-26',
      tax: 0,
      autoTax: true,
      billFormat: 'tax_invoice',
      items: [
        { productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2, huid: product.huids[1] },
      ],
    })
    const taxFinal = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, tax.id)
    expect(taxFinal.invoiceNo).toMatch(/^TI-\d{4}-\d{4}$/)
  })

  it('records partial collections and forfeits active pledges', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Collect Customer',
      phone: '9000000003',
      address: 'Salem',
      notes: '',
    })
    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-08-01',
      assessedValue: 40000,
      loanAmount: 20000,
      interestPct: 1.5,
      items: [
        {
          description: 'Bangle',
          metal: 'Gold',
          purity: '22K',
          grossWeight: 10,
          netWeight: 9.5,
          pieces: 1,
        },
      ],
    })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('draft')

    const collectBlocked = await getTestAgent().post(`/api/pledges/${created.body.id}/collect`).send({
      collectedDate: '2026-09-01',
      amount: 5000,
    })
    expect(collectBlocked.status).toBe(400)

    const sanctioned = await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)
    expect(sanctioned.status).toBe(200)
    expect(sanctioned.body.status).toBe('active')

    const partial = await getTestAgent().post(`/api/pledges/${created.body.id}/collect`).send({
      collectedDate: '2026-09-01',
      amount: 5000,
    })
    expect(partial.status).toBe(200)
    expect(partial.body.status).toBe('active')
    expect(partial.body.amountCollected).toBe(5000)

    const forfeited = await getTestAgent().post(`/api/pledges/${created.body.id}/forfeit`).send({
      forfeitedDate: '2026-09-26',
    })
    expect(forfeited.status).toBe(200)
    expect(forfeited.body.status).toBe('forfeited')
    expect(forfeited.body.redeemedDate).toBe('2026-09-26')
  })

  it('accumulates a prior collection when fully redeeming', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Redeem After Collect',
      phone: '9000000008',
      address: 'Salem',
      notes: '',
    })
    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-08-01',
      assessedValue: 100000,
      loanAmount: 50000,
      interestPct: 2,
      items: [
        {
          description: 'Chain',
          metal: 'Gold',
          purity: '22K',
          grossWeight: 12,
          netWeight: 12,
          pieces: 1,
        },
      ],
    })
    expect(created.status).toBe(201)
    const sanctioned = await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)
    expect(sanctioned.status).toBe(200)

    const interest = await getTestAgent().post(`/api/pledges/${created.body.id}/collect`).send({
      collectedDate: '2026-08-31',
      amount: 1000,
    })
    expect(interest.status).toBe(200)
    expect(interest.body.status).toBe('active')
    expect(interest.body.amountCollected).toBe(1000)

    const redeemed = await getTestAgent().post(`/api/pledges/${created.body.id}/redeem`).send({
      id: created.body.id,
      redeemedDate: '2026-08-31',
      amountCollected: 50000,
    })
    expect(redeemed.status).toBe(200)
    expect(redeemed.body.status).toBe('redeemed')
    expect(redeemed.body.amountCollected).toBe(51000)
  })

  it('records interest into the payment ledger and reports the payoff', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Ledger Customer',
      phone: '9000000031',
      address: 'Salem',
      notes: '',
    })
    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-08-01',
      assessedValue: 40000,
      loanAmount: 20000,
      interestPct: 2,
      items: [goldItem('Chain')],
    })
    expect(created.status).toBe(201)
    await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)

    const collected = await getTestAgent().post(`/api/pledges/${created.body.id}/collect`).send({
      collectedDate: '2026-08-31',
      amount: 400,
      mode: 'upi',
    })
    expect(collected.status).toBe(200)
    expect(collected.body.amountCollected).toBe(400)

    const payments = await getTestAgent().get(`/api/pledges/${created.body.id}/payments`)
    expect(payments.status).toBe(200)
    expect(payments.body).toHaveLength(1)
    expect(payments.body[0].kind).toBe('interest')
    expect(payments.body[0].mode).toBe('upi')
    expect(payments.body[0].interestPart).toBe(400)
    expect(payments.body[0].principalPart).toBe(0)

    const payoff = await getTestAgent().get(`/api/pledges/${created.body.id}/payoff?date=2026-08-31`)
    expect(payoff.status).toBe(200)
    expect(payoff.body.principalOutstanding).toBe(20000)
    expect(payoff.body.interestDue).toBe(0)
    expect(payoff.body.interestPaidUpto).toBe('2026-08-31')
    expect(payoff.body.nextInterestDue).toBe('2026-09-30')
    expect(payoff.body.payoff).toBe(20000)
  })

  it('holds a partial interest payment as interest credit', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Credit Customer',
      phone: '9000000032',
      address: 'Salem',
      notes: '',
    })
    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-08-01',
      assessedValue: 40000,
      loanAmount: 20000,
      interestPct: 2,
      items: [goldItem('Bangle')],
    })
    await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)
    await getTestAgent().post(`/api/pledges/${created.body.id}/collect`).send({
      collectedDate: '2026-08-31',
      amount: 100,
    })

    const payoff = await getTestAgent().get(`/api/pledges/${created.body.id}/payoff?date=2026-08-31`)
    expect(payoff.body.interestCredit).toBe(100)
    expect(payoff.body.interestDue).toBe(300)
    expect(payoff.body.payoff).toBe(20300)
  })

  it('redeems with a discount and clears the customer balance', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Discount Customer',
      phone: '9000000033',
      address: 'Salem',
      notes: '',
    })
    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-08-01',
      assessedValue: 40000,
      loanAmount: 20000,
      interestPct: 2,
      items: [goldItem('Ring')],
    })
    await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)

    const redeemed = await getTestAgent().post(`/api/pledges/${created.body.id}/redeem`).send({
      redeemedDate: '2026-08-31',
      amountCollected: 20000,
      discount: 400,
      mode: 'cash',
    })
    expect(redeemed.status).toBe(200)
    expect(redeemed.body.status).toBe('redeemed')
    expect(redeemed.body.amountCollected).toBe(20000)

    const ledger = await ipc<{
      columns: Array<{ customerId: number; balance: number }>
    }>(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customer.id)
    expect(column?.balance ?? 0).toBe(0)
  })

  it('rejects a collection above the payoff', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Overpay Customer',
      phone: '9000000034',
      address: 'Salem',
      notes: '',
    })
    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-08-01',
      assessedValue: 40000,
      loanAmount: 20000,
      interestPct: 2,
      items: [goldItem('Stud')],
    })
    await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)

    const over = await getTestAgent().post(`/api/pledges/${created.body.id}/collect`).send({
      collectedDate: '2026-08-31',
      amount: 999999,
    })
    expect(over.status).toBe(400)
    expect(over.body.error).toMatch(/payoff/i)
  })

  it('removes the latest pledge payment and reopens the loan', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Remove Payment Customer',
      phone: '9000000035',
      address: 'Salem',
      notes: '',
    })
    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-08-01',
      assessedValue: 40000,
      loanAmount: 20000,
      interestPct: 2,
      items: [goldItem('Bangle')],
    })
    await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)
    const collected = await getTestAgent().post(`/api/pledges/${created.body.id}/collect`).send({
      collectedDate: '2026-08-31',
      amount: 5000,
    })
    expect(collected.body.amountCollected).toBe(5000)

    const ledger = await ipc<{
      columns: Array<{
        customerId: number
        entries: Array<{ id: number; kind: string; pledgeId: number | null }>
      }>
    }>(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customer.id)
    const payment = column?.entries.find(
      (entry) => entry.pledgeId === created.body.id && entry.kind === 'payment',
    )
    expect(payment).toBeDefined()

    await ipc(IPC_CHANNELS.DUES_DELETE, payment!.id)

    const after = await getTestAgent().get(`/api/pledges/${created.body.id}`)
    expect(after.body.amountCollected).toBe(0)
    expect(after.body.status).toBe('active')
    const payments = await getTestAgent().get(`/api/pledges/${created.body.id}/payments`)
    expect(payments.body).toHaveLength(0)
  })

  it('does not post dues for a draft pledge until it is sanctioned', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Draft Due Customer',
      phone: '9000000004',
      address: 'Salem',
      notes: '',
    })
    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-09-26',
      assessedValue: 20000,
      loanAmount: 8000,
      interestPct: 2.1,
      items: [
        {
          description: 'Ring',
          metal: 'Gold',
          purity: '22K',
          grossWeight: 4,
          netWeight: 4,
          pieces: 1,
        },
      ],
    })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('draft')

    const ledgerBefore = await ipc(IPC_CHANNELS.DUES_LIST)
    const columnBefore = ledgerBefore.columns.find((entry) => entry.customerId === customer.id)
    expect(columnBefore?.entries.some((e) => e.pledgeId === created.body.id)).toBeFalsy()

    const sanctioned = await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)
    expect(sanctioned.status).toBe(200)
    expect(sanctioned.body.status).toBe('active')

    const alreadyActive = await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)
    expect(alreadyActive.status).toBe(400)

    const ledgerAfter = await ipc(IPC_CHANNELS.DUES_LIST)
    const columnAfter = ledgerAfter.columns.find((entry) => entry.customerId === customer.id)
    const dueEntry = columnAfter?.entries.find((e) => e.pledgeId === created.body.id && e.kind === 'due')
    expect(dueEntry).toBeDefined()
    expect(dueEntry?.amount).toBeGreaterThanOrEqual(created.body.loanAmount)
  })

  it('adds extra loan on the same pledged items and includes it in due principal', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Topup Customer',
      phone: '9000000018',
      address: 'Salem',
      notes: '',
    })
    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-08-01',
      assessedValue: 40000,
      loanAmount: 10000,
      interestPct: 2,
      repaymentDueDate: '2027-08-01',
      items: [
        {
          description: 'Bangle',
          metal: 'Gold',
          purity: '22K',
          grossWeight: 10,
          netWeight: 10,
          pieces: 1,
        },
      ],
    })
    expect(created.status).toBe(201)
    const sanctioned = await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)
    expect(sanctioned.status).toBe(200)

    const blocked = await getTestAgent().post(`/api/pledges/${created.body.id}/topup`).send({
      topupDate: '2026-07-01',
      amount: 2000,
    })
    expect(blocked.status).toBe(400)

    const topped = await getTestAgent().post(`/api/pledges/${created.body.id}/topup`).send({
      topupDate: '2026-08-15',
      amount: 2500,
      note: 'Extra cash',
    })
    expect(topped.status).toBe(201)
    expect(topped.body.loanAmount).toBe(10000)
    expect(topped.body.topups).toHaveLength(1)
    expect(topped.body.topups[0].amount).toBe(2500)

    const listed = await getTestAgent().get(`/api/pledges/${created.body.id}/topups`)
    expect(listed.status).toBe(200)
    expect(listed.body).toHaveLength(1)

    const ledger = await ipc(IPC_CHANNELS.DUES_LIST)
    const adagu = ledger.adaguDues?.find((row) => row.pledgeId === created.body.id)
    expect(adagu).toBeDefined()
    expect(adagu?.principal).toBe(12500)
    expect(adagu?.monthlyInterest).toBe(250)
  })

  it('rolls back a pledge create when an item insert fails', async () => {
    const customerId = await createPledgeCustomer('Atomic Create', '9000000021')
    const receiptBefore = await getTestAgent().get('/api/pledges/next-receipt-no')
    const pledgesBefore = countRows('pledges')
    const itemsBefore = countRows('pledge_items')

    getDatabase().exec(`
      CREATE TEMP TRIGGER fail_pledge_item BEFORE INSERT ON pledge_items
      WHEN NEW.description = 'FAIL'
      BEGIN SELECT RAISE(ABORT, 'forced item failure'); END
    `)

    try {
      const created = await createDraftPledge(customerId, [goldItem('Chain'), goldItem('FAIL')])
      expect(created.status).toBeGreaterThanOrEqual(400)
    } finally {
      dropTrigger('fail_pledge_item')
    }

    expect(countRows('pledges')).toBe(pledgesBefore)
    expect(countRows('pledge_items')).toBe(itemsBefore)
    const receiptAfter = await getTestAgent().get('/api/pledges/next-receipt-no')
    expect(receiptAfter.body.receiptNo).toBe(receiptBefore.body.receiptNo)
  })

  it('rolls back a pledge update and keeps the original items', async () => {
    const customerId = await createPledgeCustomer('Atomic Update', '9000000022')
    const created = await createDraftPledge(customerId, [goldItem('Chain')])
    expect(created.status).toBe(201)
    const pledgeId = created.body.id

    getDatabase().exec(`
      CREATE TEMP TRIGGER fail_pledge_item BEFORE INSERT ON pledge_items
      WHEN NEW.description = 'FAIL'
      BEGIN SELECT RAISE(ABORT, 'forced item failure'); END
    `)

    try {
      const updated = await getTestAgent()
        .put(`/api/pledges/${pledgeId}`)
        .send({
          id: pledgeId,
          customerId,
          pledgeDate: '2026-08-01',
          assessedValue: 52000,
          loanAmount: 15500,
          interestPct: 2,
          items: [goldItem('Chain'), goldItem('FAIL')],
        })
      expect(updated.status).toBeGreaterThanOrEqual(400)
    } finally {
      dropTrigger('fail_pledge_item')
    }

    const after = await getTestAgent().get(`/api/pledges/${pledgeId}`)
    expect(after.body.items).toHaveLength(1)
    expect(after.body.items[0].description).toBe('Chain')
    expect(after.body.loanAmount).toBe(20000)
  })

  it('rolls back a sanction when the dues entry cannot be written', async () => {
    const customerId = await createPledgeCustomer('Atomic Sanction', '9000000023')
    const created = await createDraftPledge(customerId, [goldItem('Ring')])
    expect(created.status).toBe(201)
    const pledgeId = created.body.id

    getDatabase().exec(`
      CREATE TEMP TRIGGER fail_pledge_due BEFORE INSERT ON customer_dues
      WHEN NEW.pledge_id = ${pledgeId} AND NEW.kind = 'due'
      BEGIN SELECT RAISE(ABORT, 'forced due failure'); END
    `)

    try {
      const sanctioned = await getTestAgent().post(`/api/pledges/${pledgeId}/sanction`)
      expect(sanctioned.status).toBeGreaterThanOrEqual(400)
    } finally {
      dropTrigger('fail_pledge_due')
    }

    const after = await getTestAgent().get(`/api/pledges/${pledgeId}`)
    expect(after.body.status).toBe('draft')
  })

  it('rolls back a collection when the dues payment cannot be written', async () => {
    const customerId = await createPledgeCustomer('Atomic Collect', '9000000024')
    const created = await createDraftPledge(customerId, [goldItem('Bangle')])
    expect(created.status).toBe(201)
    const pledgeId = created.body.id
    const sanctioned = await getTestAgent().post(`/api/pledges/${pledgeId}/sanction`)
    expect(sanctioned.status).toBe(200)

    getDatabase().exec(`
      CREATE TEMP TRIGGER fail_pledge_payment BEFORE INSERT ON customer_dues
      WHEN NEW.pledge_id = ${pledgeId} AND NEW.kind = 'payment'
      BEGIN SELECT RAISE(ABORT, 'forced payment failure'); END
    `)

    try {
      const collected = await getTestAgent()
        .post(`/api/pledges/${pledgeId}/collect`)
        .send({ collectedDate: '2026-09-01', amount: 5000 })
      expect(collected.status).toBeGreaterThanOrEqual(400)
    } finally {
      dropTrigger('fail_pledge_payment')
    }

    const after = await getTestAgent().get(`/api/pledges/${pledgeId}`)
    expect(after.body.status).toBe('active')
    expect(after.body.amountCollected).toBe(0)
  })

  it('does not write a dues payment against a forfeited pledge', async () => {
    const customerId = await createPledgeCustomer('Atomic Forfeit', '9000000025')
    const created = await createDraftPledge(customerId, [goldItem('Stud')])
    expect(created.status).toBe(201)
    const pledgeId = created.body.id
    await getTestAgent().post(`/api/pledges/${pledgeId}/sanction`)
    const forfeited = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/forfeit`)
      .send({ forfeitedDate: '2026-09-26' })
    expect(forfeited.status).toBe(200)

    const ledger = await ipc<{
      columns: Array<{ customerId: number; entries: Array<{ id: number; kind: string; pledgeId: number | null }> }>
    }>(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customerId)
    const dueEntry = column?.entries.find((entry) => entry.pledgeId === pledgeId && entry.kind === 'due')
    expect(dueEntry).toBeDefined()

    const paymentsBefore = countRows('customer_dues', `pledge_id = ? AND kind = 'payment'`, [pledgeId])
    const paid = await getTestAgent()
      .post(`/api/dues/${dueEntry!.id}/payment`)
      .send({ dueEntryId: dueEntry!.id, entryDate: '2026-09-27', amount: 1000, note: '' })
    expect(paid.status).toBe(400)
    expect(countRows('customer_dues', `pledge_id = ? AND kind = 'payment'`, [pledgeId])).toBe(
      paymentsBefore,
    )
  })

  it('locks a sanctioned loan against editing', async () => {
    const customerId = await createPledgeCustomer('Lock Customer', '9000000041')
    const created = await createDraftPledge(customerId, [goldItem('Chain')])
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('draft')

    await getTestAgent().post(`/api/pledges/${created.body.id}/sanction`)

    const blocked = await getTestAgent().put(`/api/pledges/${created.body.id}`).send({
      id: created.body.id,
      customerId,
      pledgeDate: '2026-08-01',
      assessedValue: 52000,
      loanAmount: 21000,
      interestPct: 2,
      items: [goldItem('Chain')],
    })
    expect(blocked.status).toBe(400)
    expect(blocked.body.error).toMatch(/locked/i)
  })

  it('deletes draft loans but refuses to delete sanctioned loans', async () => {
    const customerId = await createPledgeCustomer('Delete Customer', '9000000042')
    const draft = await createDraftPledge(customerId, [goldItem('Ring')])
    expect(draft.status).toBe(201)

    const removed = await getTestAgent().delete(`/api/pledges/${draft.body.id}`)
    expect(removed.status).toBe(200)
    const gone = await getTestAgent().get(`/api/pledges/${draft.body.id}`)
    expect(gone.status).toBe(404)
    expect(countRows('pledge_items', 'pledge_id = ?', [draft.body.id])).toBe(0)

    const active = await createDraftPledge(customerId, [goldItem('Stud')])
    await getTestAgent().post(`/api/pledges/${active.body.id}/sanction`)
    const refused = await getTestAgent().delete(`/api/pledges/${active.body.id}`)
    expect(refused.status).toBe(400)
    const stillThere = await getTestAgent().get(`/api/pledges/${active.body.id}`)
    expect(stillThere.status).toBe(200)
    expect(stillThere.body.status).toBe('active')
  })

  it('renews a loan into a new active ticket and clears the old balance', async () => {
    const customerId = await createPledgeCustomer('Renew Customer', '9000000043')
    const created = await createDraftPledge(customerId, [goldItem('Bangle')])
    expect(created.status).toBe(201)
    const oldId = created.body.id
    await getTestAgent().post(`/api/pledges/${oldId}/sanction`)

    const renewed = await getTestAgent().post(`/api/pledges/${oldId}/renew`).send({
      renewDate: '2026-08-31',
      mode: 'cash',
      newLoanAmount: 18000,
      note: 'Renewed at the counter',
    })
    expect(renewed.status).toBe(201)
    expect(renewed.body.status).toBe('active')
    expect(renewed.body.id).not.toBe(oldId)
    expect(renewed.body.renewedFromId).toBe(oldId)
    expect(renewed.body.receiptNo).toMatch(/^ADG\d{4,}$/)
    expect(renewed.body.loanAmount).toBe(18000)
    expect(renewed.body.items).toHaveLength(1)

    const oldTicket = await getTestAgent().get(`/api/pledges/${oldId}`)
    expect(oldTicket.body.status).toBe('renewed')
    expect(oldTicket.body.renewedToId).toBe(renewed.body.id)
    expect(oldTicket.body.renewedToReceiptNo).toBe(renewed.body.receiptNo)

    const payments = await getTestAgent().get(`/api/pledges/${oldId}/payments`)
    expect(payments.body.some((p: { kind: string }) => p.kind === 'renewal')).toBe(true)
    expect(payments.body.some((p: { kind: string }) => p.kind === 'transfer')).toBe(true)

    const ledger = await ipc<{
      columns: Array<{ customerId: number; entries: Array<{ id: number; kind: string; pledgeId: number | null }> }>
      adaguDues?: Array<{ pledgeId: number; remaining: number; status: string }>
    }>(IPC_CHANNELS.DUES_LIST)
    const oldDue = ledger.adaguDues?.find((row) => row.pledgeId === oldId)
    expect(oldDue?.remaining ?? 0).toBe(0)
    expect(oldDue?.status).toBe('renewed')
  })

  it('collects the difference on the old ticket when the renewed loan is smaller', async () => {
    const customerId = await createPledgeCustomer('Renew Smaller', '9000000044')
    const created = await createDraftPledge(customerId, [goldItem('Chain')])
    const oldId = created.body.id
    await getTestAgent().post(`/api/pledges/${oldId}/sanction`)

    const renewed = await getTestAgent().post(`/api/pledges/${oldId}/renew`).send({
      renewDate: '2026-08-31',
      mode: 'upi',
      newLoanAmount: 15000,
    })
    expect(renewed.status).toBe(201)
    expect(renewed.body.loanAmount).toBe(15000)

    const payments = await getTestAgent().get(`/api/pledges/${oldId}/payments`)
    const principalCollected = payments.body.find(
      (p: { kind: string; principalPart: number }) => p.kind === 'part' && p.principalPart > 0,
    )
    expect(principalCollected).toBeDefined()
    expect(principalCollected.mode).toBe('upi')
  })

  it('rejects a loan above the LTV limit unless an admin overrides it', async () => {
    const customerId = await createPledgeCustomer('LTV Customer', '9000000045')
    const over = await getTestAgent().post('/api/pledges').send({
      customerId,
      pledgeDate: '2026-08-01',
      assessedValue: 10000,
      loanAmount: 9000,
      interestPct: 2,
      items: [goldItem('Chain')],
    })
    expect(over.status).toBe(400)
    expect(over.body.error).toMatch(/ltv/i)

    const override = await getTestAgent().post('/api/pledges').send({
      customerId,
      pledgeDate: '2026-08-01',
      assessedValue: 10000,
      loanAmount: 9000,
      interestPct: 2,
      allowAboveLtv: true,
      items: [goldItem('Chain')],
    })
    expect(override.status).toBe(201)
    expect(override.body.loanAmount).toBe(9000)
  })

  it('stores the running rate and value on each pledged item', async () => {
    await getTestAgent().post('/api/metal-rates').send({
      effectiveDate: '2026-08-01',
      gold22k: 6000,
      gold24k: 6500,
      silverFine: 80,
      silver925: 75,
    })
    const customerId = await createPledgeCustomer('Valuation Customer', '9000000046')
    const created = await getTestAgent().post('/api/pledges').send({
      customerId,
      pledgeDate: '2026-08-01',
      assessedValue: 57000,
      loanAmount: 20000,
      interestPct: 2,
      items: [goldItem('Chain', { netWeight: 10 })],
    })
    expect(created.status).toBe(201)
    expect(created.body.items[0].ratePerGram).toBe(6000)
    expect(created.body.items[0].itemValue).toBe(60000)
  })

  it('runs the auction flow: notice, waiting period, outside buyer and surplus', async () => {
    const customerId = await createPledgeCustomer('Auction Customer', '9000000047')
    const created = await getTestAgent().post('/api/pledges').send({
      customerId,
      pledgeDate: '2026-06-01',
      assessedValue: 40000,
      loanAmount: 20000,
      interestPct: 2,
      repaymentDueDate: '2026-07-01',
      items: [goldItem('Chain')],
    })
    expect(created.status).toBe(201)
    const pledgeId = created.body.id
    await getTestAgent().post(`/api/pledges/${pledgeId}/sanction`)
    // The API clamps the due date to today, so age the loan in the test database.
    getDatabase()
      .prepare('UPDATE pledges SET repayment_due_date = ? WHERE id = ?')
      .run('2026-07-01', pledgeId)

    const early = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/auction-notice`)
      .send({ noticeDate: '2026-06-20' })
    expect(early.status).toBe(400)

    const notice = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/auction-notice`)
      .send({ noticeDate: '2026-07-15' })
    expect(notice.status).toBe(200)
    expect(notice.body.noticeDate).toBe('2026-07-15')
    expect(notice.body.auctionEligibleDate > '2026-07-15').toBe(true)

    const tooEarly = await getTestAgent().post(`/api/pledges/${pledgeId}/auction`).send({
      auctionDate: '2026-07-16',
      buyerType: 'outside',
      buyerName: 'Ravi',
      saleAmount: 25000,
    })
    expect(tooEarly.status).toBe(400)

    const auction = await getTestAgent().post(`/api/pledges/${pledgeId}/auction`).send({
      auctionDate: '2026-07-30',
      buyerType: 'outside',
      buyerName: 'Ravi',
      saleAmount: 25000,
    })
    expect(auction.status).toBe(200)
    expect(auction.body.status).toBe('forfeited')

    const row = await getTestAgent().get(`/api/pledges/${pledgeId}/auction`)
    expect(row.body.saleAmount).toBe(25000)
    expect(row.body.surplusAmount).toBeGreaterThan(0)
    expect(row.body.shortfallAmount).toBe(0)

    const payments = await getTestAgent().get(`/api/pledges/${pledgeId}/payments`)
    expect(payments.body.some((p: { kind: string }) => p.kind === 'auction')).toBe(true)

    const paid = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/auction-surplus-paid`)
      .send({ surplusPaidDate: '2026-08-01', mode: 'cash' })
    expect(paid.status).toBe(200)
    expect(paid.body.surplusPaidDate).toBe('2026-08-01')
  })

  it('moves bought-back gold into stock when the shop takes an auctioned pledge', async () => {
    const customerId = await createPledgeCustomer('Auction Shop', '9000000048')
    const created = await getTestAgent().post('/api/pledges').send({
      customerId,
      pledgeDate: '2026-06-01',
      assessedValue: 40000,
      loanAmount: 20000,
      interestPct: 2,
      repaymentDueDate: '2026-07-01',
      items: [goldItem('Chain', { netWeight: 9.5 })],
    })
    expect(created.status).toBe(201)
    const pledgeId = created.body.id
    const itemId = created.body.items[0].id
    await getTestAgent().post(`/api/pledges/${pledgeId}/sanction`)
    getDatabase()
      .prepare('UPDATE pledges SET repayment_due_date = ? WHERE id = ?')
      .run('2026-07-01', pledgeId)
    await getTestAgent()
      .post(`/api/pledges/${pledgeId}/auction-notice`)
      .send({ noticeDate: '2026-07-15' })

    const auction = await getTestAgent().post(`/api/pledges/${pledgeId}/auction`).send({
      auctionDate: '2026-07-30',
      buyerType: 'shop',
      saleAmount: 25000,
      items: [{ pledgeItemId: itemId, category: 'Chain' }],
    })
    expect(auction.status).toBe(200)
    expect(auction.body.status).toBe('forfeited')

    const movement = getDatabase()
      .prepare(
        `SELECT movement_type, metal, category, weight_delta
         FROM stock_movements
         WHERE reference_type = 'pledge_auction' AND reference_id = ?`,
      )
      .get(pledgeId) as
      | { movement_type: string; metal: string; category: string; weight_delta: number }
      | undefined
    expect(movement).toBeDefined()
    expect(movement?.movement_type).toBe('purchase')
    expect(movement?.metal).toBe('Gold')
    expect(movement?.category).toBe('Chain')
    expect(movement?.weight_delta).toBeCloseTo(9.5, 3)
  })

  it('writes off an auction shortfall and clears the customer balance', async () => {
    const customerId = await createPledgeCustomer('Auction Short', '9000000049')
    const created = await getTestAgent().post('/api/pledges').send({
      customerId,
      pledgeDate: '2026-06-01',
      assessedValue: 40000,
      loanAmount: 20000,
      interestPct: 2,
      repaymentDueDate: '2026-07-01',
      items: [goldItem('Chain')],
    })
    expect(created.status).toBe(201)
    const pledgeId = created.body.id
    await getTestAgent().post(`/api/pledges/${pledgeId}/sanction`)
    getDatabase()
      .prepare('UPDATE pledges SET repayment_due_date = ? WHERE id = ?')
      .run('2026-07-01', pledgeId)
    await getTestAgent()
      .post(`/api/pledges/${pledgeId}/auction-notice`)
      .send({ noticeDate: '2026-07-15' })

    const auction = await getTestAgent().post(`/api/pledges/${pledgeId}/auction`).send({
      auctionDate: '2026-07-30',
      buyerType: 'outside',
      buyerName: 'Ravi',
      saleAmount: 10000,
      writeOffShortfall: true,
    })
    expect(auction.status).toBe(200)

    const row = await getTestAgent().get(`/api/pledges/${pledgeId}/auction`)
    expect(row.body.shortfallAmount).toBeGreaterThan(0)
    expect(row.body.shortfallWrittenOff).toBe(true)

    const ledger = await ipc<{
      adaguDues?: Array<{ pledgeId: number; remaining: number }>
    }>(IPC_CHANNELS.DUES_LIST)
    const due = ledger.adaguDues?.find((entry) => entry.pledgeId === pledgeId)
    expect(due?.remaining ?? -1).toBe(0)
  })

  it('blocks sanctioning until KYC is entered when the shop requires it', async () => {
    setShopSetting(getDatabase(), 'adagu_require_kyc', '1')
    const customerId = await createPledgeCustomer('KYC Customer', '9000000050')
    const created = await createDraftPledge(customerId, [goldItem('Chain')])
    const pledgeId = created.body.id

    const blocked = await getTestAgent().post(`/api/pledges/${pledgeId}/sanction`).send({})
    expect(blocked.status).toBe(400)
    expect(blocked.body.error).toMatch(/kyc/i)

    await ipc(IPC_CHANNELS.CUSTOMERS_UPDATE, {
      id: customerId,
      input: {
        name: 'KYC Customer',
        phone: '9000000050',
        address: 'Salem',
        aadhaar: '123456789012',
        pan: '',
      },
    })
    const sanctioned = await getTestAgent().post(`/api/pledges/${pledgeId}/sanction`).send({})
    expect(sanctioned.status).toBe(200)
    expect(sanctioned.body.status).toBe('active')
  })

  it('uploads, lists and deletes pledge photos', async () => {
    const customerId = await createPledgeCustomer('Photo Customer', '9000000051')
    const created = await createDraftPledge(customerId, [goldItem('Chain')])
    const pledgeId = created.body.id

    // 1x1 transparent PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    const uploaded = await getTestAgent()
      .post(`/api/pledges/${pledgeId}/photos`)
      .field('kind', 'item')
      .attach('file', png, 'item.png')
    expect(uploaded.status).toBe(201)
    expect(uploaded.body.kind).toBe('item')
    expect(uploaded.body.path).toMatch(/^\/uploads\//)

    const list = await getTestAgent().get(`/api/pledges/${pledgeId}/photos`)
    expect(list.body).toHaveLength(1)

    const pledge = await getTestAgent().get(`/api/pledges/${pledgeId}`)
    expect(pledge.body.photos).toHaveLength(1)

    const removed = await getTestAgent().delete(
      `/api/pledges/${pledgeId}/photos/${uploaded.body.id}`,
    )
    expect(removed.status).toBe(200)

    const afterDelete = await getTestAgent().get(`/api/pledges/${pledgeId}/photos`)
    expect(afterDelete.body).toHaveLength(0)
  })

  it('lists reminders and logs a WhatsApp reminder when it is opened', async () => {
    const customerId = await createPledgeCustomer('Reminder Customer', '9000000052')
    const created = await createDraftPledge(customerId, [goldItem('Chain')])
    const pledgeId = created.body.id
    await getTestAgent().post(`/api/pledges/${pledgeId}/sanction`)

    const reminders = await getTestAgent().get('/api/pledges/reminders')
    expect(reminders.status).toBe(200)
    const entry = reminders.body.find(
      (row: { pledgeId: number }) => row.pledgeId === pledgeId,
    ) as
      | { reason: string; whatsappUrl: string | null; lastRemindedAt: string | null }
      | undefined
    expect(entry).toBeDefined()
    expect(entry?.reason).toBe('interest_overdue')
    expect(entry?.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919000000052\?text=/)
    expect(entry?.lastRemindedAt).toBeNull()

    const badUrl = await getTestAgent()
      .post('/api/system/open-whatsapp')
      .send({ pledgeId, url: 'https://example.com/evil' })
    expect(badUrl.status).toBe(400)

    process.env.JEWELTRACKERPRO_NO_OPEN = '1'
    try {
      const opened = await getTestAgent().post('/api/system/open-whatsapp').send({
        pledgeId,
        url: entry?.whatsappUrl,
        kind: entry?.reason,
      })
      expect(opened.status).toBe(200)
      expect(opened.body.ok).toBe(true)
    } finally {
      delete process.env.JEWELTRACKERPRO_NO_OPEN
    }

    const after = await getTestAgent().get('/api/pledges/reminders')
    const reminded = after.body.find(
      (row: { pledgeId: number }) => row.pledgeId === pledgeId,
    ) as { lastRemindedAt: string | null } | undefined
    expect(reminded?.lastRemindedAt).toBeTruthy()
  })

  it('leaves the renewal principal transfer out of collection totals', async () => {
    const customerId = await createPledgeCustomer('Renew Stats', '9000000045')
    const created = await createDraftPledge(customerId, [goldItem('Necklace')])
    const oldId = created.body.id
    await getTestAgent().post(`/api/pledges/${oldId}/sanction`)

    const renewed = await getTestAgent().post(`/api/pledges/${oldId}/renew`).send({
      renewDate: '2026-08-31',
      mode: 'cash',
      newLoanAmount: 20000,
    })
    expect(renewed.status).toBe(201)

    const payments = await getTestAgent().get(`/api/pledges/${oldId}/payments`)
    expect(payments.body.some((p: { kind: string }) => p.kind === 'transfer')).toBe(true)

    const from = '2026-08-01'
    const to = '2026-08-31'
    const daily = await getTestAgent()
      .get('/api/reports/daily-collection')
      .query({ from, to })
    const dailyTotal = (daily.body.rows as Array<{ amount: number }>).reduce(
      (sum, row) => sum + row.amount,
      0,
    )
    expect(dailyTotal).toBeGreaterThan(0)

    const stats = await getTestAgent().get('/api/invoices/stats').query({ from, to })
    expect(stats.body.collections).toBe(dailyTotal)
  })
})
