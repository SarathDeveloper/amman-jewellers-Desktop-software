import { describe, expect, it } from 'vitest'
import { getTestAgent, invokeIpcForTests, withHuids } from './helpers/testEnv'
import { IPC_CHANNELS, ipc, useIntegrationEnv } from './helpers/testEnv'

describe('dues IPC', () => {
  useIntegrationEnv()

  it('creates a due entry when an invoice is finalized', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Due Customer',
      phone: '9000000010',
      address: 'Salem',
      notes: '',
    })
    const product = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Ring',
      category: 'Ring',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 5,
      netWeight: 4,
      makingCharges: 0,
      stockQty: 2,
      imagePath: '',
    }))
    const invoice = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      paymentMode: 'upi',
      items: [{ productId: product.id, qty: 1, rate: 1500, metalRate: 1500, netWeight: 4 }],
    })
    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, invoice.id)

    const ledger = await ipc(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customer.id)
    expect(column).toBeDefined()
    const billEntry = column?.entries.find(
      (entry) => entry.invoiceId === finalized.id && entry.kind === 'due',
    )
    expect(billEntry?.kind).toBe('due')
    expect(billEntry?.amount).toBe(finalized.balanceDue)
    expect(finalized.balanceDue).toBe(finalized.total)
    expect(billEntry?.items?.[0]?.productName).toBe('Ring')
    expect(billEntry?.items?.[0]?.netWeight).toBe(4)
  })

  it('tracks partial pay on finalize and settles with markPaid', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Partial Due Customer',
      phone: '9000000001',
      address: 'Salem',
      notes: '',
    })
    const product = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Chain',
      category: 'Chain',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 10,
      netWeight: 8,
      makingCharges: 0,
      stockQty: 3,
      imagePath: '',
    }))
    const invoice = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      paymentMode: 'cash',
      amountPaid: 2000,
      items: [{ productId: product.id, qty: 1, rate: 5000, metalRate: 5000, netWeight: 8 }],
    })
    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, invoice.id)
    expect(finalized.amountPaid).toBe(2000)
    expect(finalized.balanceDue).toBe(finalized.total - 2000)
    expect(finalized.balanceDue).toBeGreaterThan(0)

    const ledger = await ipc(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customer.id)
    expect(column).toBeDefined()
    const dueEntry = column?.entries.find((e) => e.invoiceId === finalized.id && e.kind === 'due')
    const paymentEntry = column?.entries.find(
      (e) => e.invoiceId === finalized.id && e.kind === 'payment',
    )
    expect(dueEntry?.amount).toBe(finalized.total)
    expect(paymentEntry?.amount).toBe(2000)
    expect(column?.balance).toBe(finalized.balanceDue)
    expect(dueEntry?.items?.[0]?.productName).toBe('Chain')
    expect(dueEntry?.items?.[0]?.netWeight).toBe(8)
    expect(dueEntry?.balanceDue).toBe(finalized.balanceDue)

    const partialAmount = Math.min(1000, finalized.balanceDue)
    const recorded = await ipc(IPC_CHANNELS.DUES_RECORD_PAYMENT, {
      dueEntryId: dueEntry!.id,
      amount: partialAmount,
      entryDate: '2026-09-25',
      note: 'Partial settle',
    })
    expect(recorded.kind).toBe('payment')
    expect(recorded.amount).toBe(partialAmount)

    const afterPartial = await ipc(IPC_CHANNELS.DUES_LIST)
    const colAfterPartial = afterPartial.columns.find((c) => c.customerId === customer.id)
    const dueAfterPartial = colAfterPartial?.entries.find((e) => e.id === dueEntry!.id)
    const expectedAfterPartial = finalized.balanceDue - partialAmount
    expect(dueAfterPartial?.balanceDue).toBe(expectedAfterPartial)
    expect(colAfterPartial?.balance).toBe(expectedAfterPartial)

    await ipc(IPC_CHANNELS.DUES_MARK_PAID, dueEntry!.id)

    const afterPaid = await ipc(IPC_CHANNELS.DUES_LIST)
    const colAfterPaid = afterPaid.columns.find((c) => c.customerId === customer.id)
    const dueAfterPaid = colAfterPaid?.entries.find((e) => e.id === dueEntry!.id)
    expect(dueAfterPaid?.balanceDue).toBe(0)
    expect(colAfterPaid?.balance).toBe(0)

    const invoiceAfter = await ipc(IPC_CHANNELS.INVOICES_GET, finalized.id)
    expect(invoiceAfter.amountPaid).toBe(invoiceAfter.total)
    expect(invoiceAfter.balanceDue).toBe(0)
  })

  it('restores invoice balance when a linked payment is deleted', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Delete Payment Customer',
      phone: '9000000011',
      address: 'Salem',
      notes: '',
    })
    const product = await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({
      name: 'Chain',
      category: 'Chain',
      metal: 'Gold',
      purity: '22K',
      grossWeight: 10,
      netWeight: 8,
      makingCharges: 0,
      stockQty: 3,
      imagePath: '',
    }))
    const invoice = await ipc(IPC_CHANNELS.INVOICES_CREATE, {
      customerId: customer.id,
      invoiceDate: '2026-09-24',
      tax: 0,
      autoTax: false,
      paymentMode: 'upi',
      items: [{ productId: product.id, qty: 1, rate: 5000, metalRate: 5000, netWeight: 8 }],
    })
    const finalized = await ipc(IPC_CHANNELS.INVOICES_FINALIZE, invoice.id)

    const ledger = await ipc(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customer.id)
    const dueEntry = column?.entries.find((e) => e.invoiceId === finalized.id && e.kind === 'due')
    expect(dueEntry).toBeDefined()

    const payment = await ipc(IPC_CHANNELS.DUES_RECORD_PAYMENT, {
      dueEntryId: dueEntry!.id,
      amount: 1500,
      entryDate: '2026-09-25',
      note: 'Test payment',
    })

    const afterPay = await ipc(IPC_CHANNELS.INVOICES_GET, finalized.id)
    expect(afterPay.amountPaid).toBe(1500)
    expect(afterPay.balanceDue).toBe(afterPay.total - 1500)

    await ipc(IPC_CHANNELS.DUES_DELETE, payment.id)

    const afterDelete = await ipc(IPC_CHANNELS.INVOICES_GET, finalized.id)
    expect(afterDelete.amountPaid).toBe(0)
    expect(afterDelete.balanceDue).toBe(afterDelete.total)

    const editDue = await invokeIpcForTests(IPC_CHANNELS.DUES_UPDATE, {
      id: dueEntry!.id,
      entryDate: '2026-09-24',
      kind: 'due',
      amount: 100,
      note: 'Changed',
    })
    expect(editDue.ok).toBe(false)
    expect(editDue.error).toMatch(/Bill-linked entries cannot be edited/i)
  })

  it('posts Adagu pledge outstanding onto the dues ledger and accepts collection', async () => {
    const customer = await ipc(IPC_CHANNELS.CUSTOMERS_CREATE, {
      name: 'Adagu Due Customer',
      phone: '9000000012',
      address: 'Salem',
      notes: '',
    })

    const created = await getTestAgent().post('/api/pledges').send({
      customerId: customer.id,
      pledgeDate: '2026-09-26',
      assessedValue: 20000,
      loanAmount: 10000,
      interestPct: 2.1,
      repaymentDueDate: '2026-10-26',
      items: [
        {
          description: 'Bangle',
          metal: 'Gold',
          purity: '22K',
          grossWeight: 8,
          netWeight: 8,
          pieces: 1,
        },
      ],
    })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('draft')
    const pledge = created.body as { id: number; receiptNo: string; loanAmount: number }

    const ledgerBefore = await ipc(IPC_CHANNELS.DUES_LIST)
    const columnBefore = ledgerBefore.columns.find((entry) => entry.customerId === customer.id)
    expect(columnBefore?.entries.some((e) => e.pledgeId === pledge.id)).toBeFalsy()

    const sanctioned = await getTestAgent().post(`/api/pledges/${pledge.id}/sanction`)
    expect(sanctioned.status).toBe(200)
    expect(sanctioned.body.status).toBe('active')

    const ledger = await ipc(IPC_CHANNELS.DUES_LIST)
    const column = ledger.columns.find((entry) => entry.customerId === customer.id)
    expect(column).toBeDefined()
    const dueEntry = column?.entries.find((e) => e.pledgeId === pledge.id && e.kind === 'due')
    expect(dueEntry).toBeDefined()
    expect(dueEntry?.pledgeReceiptNo).toBe(pledge.receiptNo)
    expect(dueEntry?.amount).toBeGreaterThanOrEqual(pledge.loanAmount)
    expect(dueEntry?.balanceDue).toBeGreaterThan(0)
    expect(column?.balance).toBeGreaterThan(0)

    const partial = Math.min(2500, dueEntry!.balanceDue ?? 0)
    const payment = await ipc(IPC_CHANNELS.DUES_RECORD_PAYMENT, {
      dueEntryId: dueEntry!.id,
      amount: partial,
      entryDate: '2026-09-26',
      note: 'Adagu partial',
    })
    expect(payment.kind).toBe('payment')
    expect(payment.amount).toBe(partial)
    expect(payment.pledgeId).toBe(pledge.id)

    const afterPay = await getTestAgent().get(`/api/pledges/${pledge.id}`)
    expect(afterPay.status).toBe(200)
    expect(afterPay.body.amountCollected).toBe(partial)
    expect(afterPay.body.status).toBe('active')

    const afterLedger = await ipc(IPC_CHANNELS.DUES_LIST)
    const colAfter = afterLedger.columns.find((c) => c.customerId === customer.id)
    const dueAfter = colAfter?.entries.find((e) => e.id === dueEntry!.id)
    expect(dueAfter?.balanceDue).toBeLessThan(dueEntry!.balanceDue!)
    expect(colAfter?.balance).toBeLessThan(column!.balance)

    const collected = await getTestAgent().post(`/api/pledges/${pledge.id}/collect`).send({
      amount: 1000,
      collectedDate: '2026-09-26',
    })
    expect(collected.status).toBe(200)
    expect(collected.body.amountCollected).toBe(partial + 1000)

    const afterCollect = await ipc(IPC_CHANNELS.DUES_LIST)
    const colCollect = afterCollect.columns.find((c) => c.customerId === customer.id)
    const payments = colCollect?.entries.filter((e) => e.pledgeId === pledge.id && e.kind === 'payment') ?? []
    const paidSum = payments.reduce((sum, e) => sum + e.amount, 0)
    expect(paidSum).toBe(partial + 1000)

    const adagu = afterCollect.adaguDues?.find((row) => row.pledgeId === pledge.id)
    expect(adagu).toBeDefined()
    expect(adagu?.receiptNo).toBe(pledge.receiptNo)
    expect(adagu?.monthlyInterest).toBeGreaterThan(0)
    expect(adagu?.remaining).toBeGreaterThan(0)
  })
})
