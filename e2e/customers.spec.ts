import { expect, test } from './fixtures/web-app'
import { sidebarLink } from './helpers/nav'
import { seedFinalInvoice } from './helpers/seed'

test('customers CRUD', async ({ window }) => {
  await sidebarLink(window, 'Customers').click()
  await expect(window.getByRole('heading', { name: 'Customers' })).toBeVisible()

  await window.getByRole('button', { name: 'Add customer' }).click()
  const form = window.getByRole('dialog', { name: 'Add customer' })
  await form.getByLabel('Name', { exact: true }).fill('Short Mobile')
  await form.getByLabel('Mobile').fill('12345')
  await form.getByLabel('Address').fill('Salem')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form.getByText('Mobile number must be exactly 10 digits')).toBeVisible()
  await expect(window.locator('.app-page .error-banner')).toHaveCount(0)
  await form.getByRole('button', { name: 'Cancel' }).click()

  await window.getByRole('button', { name: 'Add customer' }).click()
  await window.getByLabel('Name', { exact: true }).fill('E2E Customer')
  await window.getByLabel('Mobile').fill('9111111111')
  await window.getByLabel('Address').fill('Salem')
  await window.getByLabel('Notes').fill('Test')
  await window.getByRole('button', { name: 'Save' }).click()

  await expect(window.getByRole('cell', { name: 'E2E Customer' })).toBeVisible()

  await window.getByRole('button', { name: 'Edit' }).click()
  await window.getByLabel('Name', { exact: true }).fill('E2E Customer Updated')
  await window.getByRole('button', { name: 'Save' }).click()
  await expect(window.getByRole('cell', { name: 'E2E Customer Updated' })).toBeVisible()

  await window.getByRole('button', { name: 'Delete' }).click()
  await window.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(window.getByText('No customers yet')).toBeVisible()
})

test('customer profile shows purchase and due history', async ({ window }) => {
  await seedFinalInvoice(window)

  await sidebarLink(window, 'Customers').click()
  await expect(window.getByRole('heading', { name: 'Customers' })).toBeVisible()
  const customerRow = window.getByRole('row').filter({ hasText: 'E2E Customer' })
  await customerRow.getByRole('button', { name: 'E2E Customer' }).click()

  await expect(window.getByRole('heading', { name: 'E2E Customer', level: 1 })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Customer Profile' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Loan history' })).toBeVisible()
  await expect(window.getByText('Total Purchases')).toBeVisible()
  await expect(window.getByText('Total Paid')).toBeVisible()
  await expect(window.getByText('Outstanding')).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Purchase History' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Payment History' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Due History' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Purchase History' }).locator('..').getByText(/CB-|TI-/)).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Due History' }).locator('..').getByText(/CB-|TI-/)).toBeVisible()
  await expect(window.getByText('No payments recorded.')).toBeVisible()
})
