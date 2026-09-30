import { expect, test } from './fixtures/web-app'
import { sidebarLink } from './helpers/nav'
import { seedFinalInvoice } from './helpers/seed'

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
