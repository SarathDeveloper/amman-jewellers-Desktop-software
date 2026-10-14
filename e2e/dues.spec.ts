import { expect, test } from './fixtures/web-app'
import {
  adaguDueRow,
  openAdaguDueDrawer,
  openDuesTab,
  receiptNoFromDueRow,
} from './helpers/inventoryBilling'
import { sidebarLink } from './helpers/nav'
import { seedActiveAdaguLoan, seedFinalInvoice } from './helpers/seed'

test('dues ledger shows bill after finalize', async ({ window }) => {
  await seedFinalInvoice(window)

  await sidebarLink(window, 'Dues').click()
  await expect(window.getByRole('heading', { name: /Dues/i })).toBeVisible()
  await expect(window.getByText('E2E Customer')).toBeVisible()
  await window.getByRole('button', { name: 'Details' }).click()
  await expect(window.getByRole('heading', { name: 'Payment detail' })).toBeVisible()
  await expect(window.getByText(/Bill (CB-|TI-)/)).toBeVisible()
  await expect(window.getByText('E2E Chain')).toBeVisible()
  await expect(window.getByText('E2E Customer').nth(1)).toBeVisible()
  await expect(window.getByRole('button', { name: 'Mark paid' })).toBeVisible()
})

test('adagu redeem hides Full redeem when the collected amount is below payoff', async ({
  window,
}) => {
  const stamp = Date.now()
  const customerName = `Redeem UI ${stamp}`
  await seedActiveAdaguLoan(window, {
    name: customerName,
    phone: `9${String(stamp).slice(-9)}`,
    amount: 50_000,
  })

  await openDuesTab(window, 'Adagu Dues')
  const row = await adaguDueRow(window, customerName)
  const receiptNo = await receiptNoFromDueRow(row)
  const drawer = await openAdaguDueDrawer(window, receiptNo, customerName)
  await drawer.getByRole('button', { name: 'Redeem', exact: true }).click()

  const redeem = window.getByRole('dialog', { name: new RegExp(`Close Adagu loan · ${receiptNo}`) })
  await expect(redeem).toBeVisible()
  await expect(redeem.getByRole('button', { name: 'Full redeem' })).toBeVisible()

  await redeem.getByLabel('Amount collected').fill('5000')
  await expect(redeem.getByRole('button', { name: 'Full redeem' })).toHaveCount(0)
  await expect(redeem.getByRole('button', { name: 'Record collection' })).toBeVisible()

  await redeem.getByRole('button', { name: 'Fill payoff' }).click()
  await expect(redeem.getByRole('button', { name: 'Full redeem' })).toBeVisible()
})
