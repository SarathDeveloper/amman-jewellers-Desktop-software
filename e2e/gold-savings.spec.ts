/**
 * Gold Savings sample data + manual QA flows.
 * Run: npm run build && npx playwright test e2e/gold-savings.spec.ts
 */
import type { Page } from '@playwright/test'
import { getDatabase } from '../server/db'
import { expect, test } from './fixtures/web-app'
import { expectPrintPreviewModal, openGoldSavingsTab, sidebarLink } from './helpers/nav'
import { seedGoldSavingsDemo, seedShopName } from './helpers/seed'

async function pickCustomer(window: Page, name: string) {
  await window.getByPlaceholder('Search customer by name, phone or ID…').fill(name)
  await window.locator('.billing-customer-option').filter({ hasText: name }).first().click()
}

async function selectScheme(window: Page, name: string) {
  const schemeSelect = window.locator('label').filter({ hasText: 'Scheme' }).locator('select')
  const value = await schemeSelect.locator('option').filter({ hasText: name }).getAttribute('value')
  if (!value) throw new Error(`Scheme option not found: ${name}`)
  await schemeSelect.selectOption(value)
}

async function closePrintPreview(window: Page, title: string) {
  const dialog = await expectPrintPreviewModal(window, title)
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).click({ force: true })
  await expect(dialog).toBeHidden()
}

test('chrome tabs show seeded personas and dashboard KPIs', async ({ window }) => {
  seedGoldSavingsDemo()

  await openGoldSavingsTab(window, 'Dashboard')
  await expect(window.getByRole('heading', { name: 'Monthly Gold Savings' })).toBeVisible()
  await expect(window.locator('.dashboard-kpi-card', { hasText: 'Overdue installments' }).locator('.kpi-value')).not.toHaveText('0')
  await expect(window.locator('.dashboard-kpi-card', { hasText: "Today's collections" }).locator('.kpi-value')).not.toHaveText('₹0')
  for (const name of ['Ravi Kumar', 'Priya', 'Suresh', 'Meena'] as const) {
    await expect(window.locator('.dashboard-due-name').filter({ hasText: name }).first()).toBeVisible()
  }

  const tabHeadings = [
    ['Schemes', 'Scheme configuration'],
    ['Enroll', 'Enroll customer'],
    ['Accounts', 'Scheme accounts'],
    ['Collections', 'Monthly collections'],
    ['Ledger', 'Scheme ledger'],
    ['Maturity', 'Maturity & redemption'],
    ['Overdue', 'Overdue aging'],
    ['Reports', 'Daily collections'],
  ] as const
  for (const [tab, heading] of tabHeadings) {
    await openGoldSavingsTab(window, tab)
    await expect(window.getByRole('heading', { name: heading })).toBeVisible()
  }

  await openGoldSavingsTab(window, 'Collections')
  await expect(window.getByRole('row').filter({ hasText: 'Ravi Kumar' })).toBeVisible()
  await expect(window.getByRole('row').filter({ hasText: 'Priya' })).toBeVisible()
  await expect(window.getByRole('row').filter({ hasText: 'Suresh' })).toBeVisible()
  await expect(window.getByRole('row').filter({ hasText: 'Suresh' })).toContainText('Overdue')

  await openGoldSavingsTab(window, 'Accounts')
  await expect(window.getByRole('row').filter({ hasText: 'Ravi Kumar' })).toBeVisible()
  await expect(window.getByRole('row').filter({ hasText: 'Priya' })).toBeVisible()
  await expect(window.getByRole('row').filter({ hasText: 'Suresh' })).toBeVisible()
  await expect(window.getByRole('row').filter({ hasText: 'Meena' })).toBeVisible()
  await expect(window.getByRole('row').filter({ hasText: 'Kumar' }).filter({ hasNotText: 'Ravi Kumar' })).toBeVisible()
  await expect(window.getByText('Cancelled').first()).toBeVisible()
  await expect(window.getByText('Matured').first()).toBeVisible()

  await openGoldSavingsTab(window, 'Schemes')
  await expect(window.getByRole('cell', { name: 'Monthly Gold 2000' })).toBeVisible()
  await expect(window.getByRole('cell', { name: 'Bonus Gold 2 months' })).toBeVisible()
})

test('enroll without terms stays disabled; duplicate Ravi is blocked; new customer enrolls, prints, then cancels', async ({
  window,
}) => {
  seedGoldSavingsDemo()

  await openGoldSavingsTab(window, 'Enroll')
  await pickCustomer(window, 'Ravi Kumar')
  await selectScheme(window, 'Monthly Gold 2000')
  await expect(window.getByRole('button', { name: 'Create scheme account' })).toBeDisabled()

  await window.getByRole('checkbox', { name: /accepted the scheme terms/i }).check()
  await window.getByRole('button', { name: 'Create scheme account' }).click()
  await window.getByRole('dialog', { name: 'Confirm enrollment' }).getByRole('button', { name: 'Enroll' }).click()
  await expect(window.getByText(/already has an active account/i)).toBeVisible()

  await window.getByRole('button', { name: 'Clear customer' }).click()
  await window.getByPlaceholder('Search customer by name, phone or ID…').fill('E2E Gold Customer')
  await window.getByRole('button', { name: 'No customer found — Add new' }).click()
  const customerDialog = window.getByRole('dialog', { name: 'Add customer' })
  await customerDialog.getByLabel('Name', { exact: true }).fill('E2E Gold Customer')
  await customerDialog.getByLabel('Mobile').fill('9111111199')
  await customerDialog.getByLabel('Address').fill('Salem')
  await customerDialog.getByRole('button', { name: 'Save' }).click()
  await expect(customerDialog).toBeHidden()
  await expect(window.getByPlaceholder('Search customer by name, phone or ID…')).toHaveValue('E2E Gold Customer')

  await selectScheme(window, 'Monthly Gold 2000')
  const terms = window.getByRole('checkbox', { name: /accepted the scheme terms/i })
  if (!(await terms.isChecked())) await terms.check()
  await window.getByRole('button', { name: 'Create scheme account' }).click()
  await window.getByRole('dialog', { name: 'Confirm enrollment' }).getByRole('button', { name: 'Enroll' }).click()
  await expect(window.getByText('Customer enrolled')).toBeVisible()
  const receiptDialog = window.getByRole('dialog', { name: 'Enrollment receipt' })
  const accountHeading = window.getByRole('heading', { name: /^GS-/ })
  await expect(receiptDialog.or(accountHeading)).toBeVisible({ timeout: 15_000 })
  if (await receiptDialog.isVisible()) {
    await receiptDialog.getByRole('button', { name: 'Close' }).click({ force: true })
  }
  await expect(accountHeading).toBeVisible({ timeout: 15_000 })
  await expect(window.getByText(/E2E Gold Customer/).first()).toBeVisible()

  await window.getByRole('button', { name: 'Cancel', exact: true }).click()
  const cancelDialog = window.getByRole('dialog', { name: 'Cancel scheme account' })
  await cancelDialog.getByLabel('Reason').fill('E2E cancel after enroll')
  await cancelDialog.getByRole('button', { name: 'Cancel account' }).click()
  await expect(window.locator('.settings-row').filter({ hasText: 'Status' })).toContainText('Cancelled')
})

test('collect Priya next installment then reverse it', async ({ window }) => {
  seedGoldSavingsDemo()

  await openGoldSavingsTab(window, 'Collections')
  await window.getByRole('row').filter({ hasText: 'Priya' }).click()
  await window.getByRole('button', { name: 'Collect next installment' }).click()
  await window.getByRole('button', { name: 'Record payment' }).click()
  await window.getByRole('dialog', { name: 'Confirm collection' }).getByRole('button', { name: 'Confirm' }).click()
  await closePrintPreview(window, 'Collection receipt')

  await openGoldSavingsTab(window, 'Accounts')
  await window.getByRole('row').filter({ hasText: 'Priya' }).getByRole('link').click()
  await window.getByRole('tab', { name: 'Payments' }).click()
  await window.getByRole('button', { name: 'Reverse' }).last().click()
  const reverseDialog = window.getByRole('dialog', { name: 'Reverse payment' })
  await reverseDialog.getByRole('textbox').fill('E2E reverse collection')
  await reverseDialog.getByRole('button', { name: 'Reverse payment' }).click()
  await expect(window.getByText('Payment reversed')).toBeVisible()
  await expect(window.getByText('Reversed').first()).toBeVisible()
})

test('collect two installments in one batch and reprint the batch receipt', async ({ window }) => {
  seedGoldSavingsDemo()

  await openGoldSavingsTab(window, 'Collections')
  await window.getByRole('row').filter({ hasText: 'Suresh' }).click()
  await window.getByRole('button', { name: 'Collect next installment' }).click()

  const collectDialog = window.getByRole('dialog', { name: /^Collect GS-/ })
  const countInput = collectDialog.locator('.gs-stepper input')
  await expect(countInput).toBeEnabled()
  await countInput.fill('2')
  await expect(collectDialog.getByText(/^Installments in this receipt$/)).toBeVisible()
  await expect(collectDialog.getByText(/^2 installments ·/)).toBeVisible()

  await collectDialog.getByRole('button', { name: 'Record payment' }).click()
  await window.getByRole('dialog', { name: 'Confirm collection' }).getByRole('button', { name: 'Confirm' }).click()
  await closePrintPreview(window, 'Collection receipt')

  const batch = getDatabase()
    .prepare(
      `SELECT batch_no AS batchNo, COUNT(*) AS rows
       FROM gold_saving_payments
       WHERE batch_no IS NOT NULL AND status = 'posted'
       GROUP BY batch_no
       ORDER BY batch_no DESC
       LIMIT 1`,
    )
    .get() as { batchNo: string; rows: number }
  expect(batch.rows).toBe(2)
  expect(batch.batchNo).toMatch(/^GSB-\d{4}-\d{4}$/)

  const first = getDatabase()
    .prepare(`SELECT id FROM gold_saving_payments WHERE batch_no = ? ORDER BY id LIMIT 1`)
    .get(batch.batchNo) as { id: number }

  await seedShopName(window, 'Gold Savings Print Shop')
  const origin = new URL(window.url()).origin
  await window.goto(`${origin}/print/gs-batch-receipt/${first.id}`)
  await expect(window.getByRole('heading', { name: 'Gold Savings Print Shop' })).toBeVisible({ timeout: 15_000 })
  await expect(window.locator('.gs-receipt-note').first()).toContainText('One receipt for 2 installments')
  await expect(window.locator('.gs-receipt-batch tbody tr')).toHaveCount(2)
  await expect(
    window.locator('.gs-receipt tr').filter({ hasText: 'Total amount paid to date' }),
  ).toContainText('₹6000.00')
  await expect(window.locator('.gs-receipt-print-error')).toHaveCount(0)
})

test('customer with a scheme account cannot be deleted', async ({ window }) => {
  seedGoldSavingsDemo()

  await sidebarLink(window, 'Customers').click()
  await expect(window.getByRole('heading', { name: 'Customers' })).toBeVisible()
  await window.getByPlaceholder('Search name or phone...').fill('Ravi Kumar')
  const row = window.getByRole('row').filter({ hasText: 'Ravi Kumar' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Delete' }).click()
  await window.getByRole('dialog', { name: 'Delete customer' }).getByRole('button', { name: 'Delete' }).click()
  await expect(window.locator('.error-banner')).toContainText(/gold savings/i)
  await expect(row).toBeVisible()
})

test('staff without gold_savings does not see the sidebar item', async ({ window }) => {
  const origin = new URL(window.url()).origin

  await window.evaluate(async () => {
    async function api<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      })
      if (!response.ok) throw new Error(await response.text())
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'gsstaff',
        password: 'staff123',
        role: 'staff',
        features: ['billing'],
      }),
    })
    await api('/api/auth/logout', { method: 'POST' })
  })

  await window.goto(`${origin}/login`)
  await window.getByLabel('Username').fill('gsstaff')
  await window.getByLabel('Password').fill('staff123')
  await window.getByRole('button', { name: 'Sign in' }).click()
  await expect(window.getByRole('heading', { name: 'Change password' })).toBeVisible()
  await window.getByLabel('Current password').fill('staff123')
  await window.getByLabel('New password', { exact: true }).fill('staff456')
  await window.getByLabel('Confirm new password').fill('staff456')
  await window.getByRole('button', { name: 'Save password' }).click()

  await expect(window.locator('.sidebar-nav').getByRole('link', { name: 'Billing' })).toBeVisible()
  await expect(window.locator('.sidebar-nav').getByRole('link', { name: 'Gold Savings' })).toHaveCount(0)
})

test('receipt and passbook print routes render without errors', async ({ window }) => {
  seedGoldSavingsDemo()
  await seedShopName(window, 'Gold Savings Print Shop')

  const ids = getDatabase()
    .prepare(
      `SELECT p.id AS paymentId, p.account_id AS accountId
       FROM gold_saving_payments p
       WHERE p.status = 'posted'
       ORDER BY p.id
       LIMIT 1`,
    )
    .get() as { paymentId: number; accountId: number }

  const origin = new URL(window.url()).origin
  await window.goto(`${origin}/print/gs-receipt/${ids.paymentId}`)
  await expect(window.getByRole('heading', { name: 'Gold Savings Print Shop' })).toBeVisible({ timeout: 15_000 })
  await expect(window.locator('.gs-passbook')).toBeVisible()
  await expect(window.locator('.error-banner')).toHaveCount(0)
  await expect(window.locator('.gs-receipt-print-error')).toHaveCount(0)

  await window.goto(`${origin}/print/gs-passbook/${ids.accountId}`)
  await expect(window.getByRole('heading', { name: 'Gold Savings Print Shop' })).toBeVisible({ timeout: 15_000 })
  await expect(window.locator('.error-banner')).toHaveCount(0)
  await expect(window.locator('.gs-passbook-print-status')).toHaveCount(0)
})

test('call list print route lists overdue accounts and honours the bucket filter', async ({ window }) => {
  seedGoldSavingsDemo()
  await seedShopName(window, 'Gold Savings Print Shop')

  const origin = new URL(window.url()).origin
  await window.goto(`${origin}/print/gs-call-list`)
  await expect(window.getByRole('heading', { name: 'Gold Savings Print Shop' })).toBeVisible({ timeout: 15_000 })
  await expect(window.locator('.gs-call-list-table tbody tr')).not.toHaveCount(0)
  await expect(window.locator('.gs-call-list-table')).toContainText('Suresh')
  await expect(window.locator('.gs-call-list-error')).toHaveCount(0)
  await expect(window.locator('.gs-call-list-summary')).toContainText('to collect')

  await window.goto(`${origin}/print/gs-call-list?bucket=${encodeURIComponent('30+ days')}`)
  await expect(window.getByRole('heading', { name: 'Gold Savings Print Shop' })).toBeVisible({ timeout: 15_000 })
  await expect(window.locator('.gs-call-list-meta')).toContainText('30+ days')
  await expect(window.locator('.gs-call-list-error')).toHaveCount(0)
})

test('reports list overdue installments and daily collections', async ({ window }) => {
  seedGoldSavingsDemo()

  await openGoldSavingsTab(window, 'Reports')
  await expect(window.getByRole('heading', { name: 'Daily collections' })).toBeVisible()
  await expect(window.locator('.reports-table tbody tr')).not.toHaveCount(0)
  await expect(window.locator('.reports-table')).toContainText('Ravi Kumar')

  await window.getByLabel('Report').selectOption({ label: 'Overdue installments' })
  await expect(window.getByRole('heading', { name: 'Overdue installments' })).toBeVisible()
  await expect(window.locator('.reports-table')).toContainText('Suresh')
})
