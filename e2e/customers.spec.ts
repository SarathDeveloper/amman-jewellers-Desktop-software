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
  await customerRow.locator('td').nth(2).click()

  await expect(window.getByRole('heading', { name: 'E2E Customer', level: 1 })).toBeVisible()
  await expect(window.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  await expect(window.getByRole('heading', { name: 'Customer Profile' })).toBeVisible()
  await expect(window.getByText('Basic details and contact information')).toBeVisible()
  await expect(window.getByText('E2E Customer').nth(1)).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Loan History' })).toBeVisible()
  await expect(window.getByText('No loans yet')).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Active Adagu' })).toBeVisible()
  await expect(window.getByText('No active adagu loans')).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Active Schemes' })).toBeVisible()
  await expect(window.getByText('No active schemes')).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Old Gold Sold' })).toBeVisible()
  await expect(window.getByText('No old gold purchases yet')).toBeVisible()
  await expect(window.getByRole('tab', { name: 'Active Loans & Adagu' })).toBeVisible()
  await expect(window.getByRole('tab', { name: 'Dues & Payments' })).toBeVisible()

  await window.getByRole('tab', { name: 'Billing History' }).click()
  await expect(window.getByRole('heading', { name: 'Billing History' })).toBeVisible()
  await expect(window.getByText(/CB-|TI-/)).toBeVisible()
})
