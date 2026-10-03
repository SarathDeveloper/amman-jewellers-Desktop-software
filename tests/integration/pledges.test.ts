import { describe, expect, it } from 'vitest'
import { getTestAgent, ipc, IPC_CHANNELS, useIntegrationEnv, withHuids } from './helpers/testEnv'

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
        amountCollected: 16000,
      })
    expect(redeemed.status).toBe(200)
    expect(redeemed.body.status).toBe('redeemed')
    expect(redeemed.body.amountCollected).toBe(16000)

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
      items: [{ productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2 }],
    })
    expect(cash.invoiceNo).toMatch(/^CB-\d{4}-\d{4}$/)

    const tax = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-26',
      tax: 0,
      autoTax: true,
      billFormat: 'tax_invoice',
      items: [{ productId: product.id, qty: 1, rate: 100, metalRate: 100, netWeight: 2 }],
    })
    expect(tax.invoiceNo).toMatch(/^TI-\d{4}-\d{4}$/)
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
      assessedValue: 40000,
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
})
