import { expect, test } from './fixtures/web-app'
import { localTodayIso } from './helpers/dates'
import { openInventoryTab, sidebarLink } from './helpers/nav'
import { fillProductDialog, saveProductDialog } from './helpers/productForm'

test('billing create, finalize, and stock deduction', async ({ window }) => {
  const today = localTodayIso()
  const productName = `Bill Product ${Date.now()}`

  await openInventoryTab(window, 'Products')
  await window.getByRole('button', { name: 'Add product' }).click()
  const addDialog = window.getByRole('dialog', { name: 'Add product' })
  await fillProductDialog(addDialog, {
    name: productName,
    category: 'Ring',
    grossWeight: '5',
    netWeight: '4',
    makingCharges: '0',
    stockQty: '3',
  })
  await saveProductDialog(addDialog)

  await sidebarLink(window, 'Customers').click()
  await window.getByRole('button', { name: 'Add customer' }).click()
  await window.getByLabel('Name', { exact: true }).fill('Bill Customer')
  await window.getByLabel('Mobile').fill('9999999999')
  await window.getByRole('button', { name: 'Save' }).click()

  await sidebarLink(window, 'Billing').click()
  await expect(window.getByRole('tab', { name: /Cash Bill/ })).toBeVisible()
  await window.getByRole('tab', { name: /Cash Bill/ }).click()
  await expect(window.getByRole('button', { name: 'Reprint last' })).toBeVisible()
  await window.getByRole('link', { name: 'New Cash Bill' }).click()
  await expect(window.getByRole('heading', { name: 'New Cash Bill' })).toBeVisible()

  const customerSearch = window.getByPlaceholder('Search customer by name, phone or ID…')
  await customerSearch.fill('Bill Customer')
  await window.getByRole('option', { name: /Bill Customer/ }).click()

  await window.getByLabel('Bill date').fill(today)

  await window.getByRole('tab', { name: 'Quick add (Manual)' }).click()
  await window.locator('.billing-add-row--primary select.select').selectOption({ label: productName })
  await window.locator('.billing-add-row--weights input[type="number"]').nth(1).fill('1500')
  await window.getByRole('button', { name: 'Add', exact: true }).click()

  await window.getByRole('button', { name: 'Save draft' }).first().click()
  await expect(window.locator('.badge.draft')).toBeVisible()

  await window.getByRole('button', { name: 'Finalize', exact: true }).click()
  await expect(window.locator('.badge.final')).toBeVisible()

  await openInventoryTab(window, 'Products')
  const row = window.getByRole('row').filter({ hasText: productName })
  await expect(row.locator('.stock-qty')).toHaveText('2')
})

test('billing add customer from new bill page', async ({ window }) => {
  const customerName = `Counter Sale ${Date.now()}`

  await sidebarLink(window, 'Billing').click()
  await window.getByRole('tab', { name: /Cash Bill/ }).click()
  await window.getByRole('link', { name: 'New Cash Bill' }).click()

  await window.getByPlaceholder('Search customer by name, phone or ID…').fill(customerName)
  await window.getByRole('button', { name: 'No customer found — Add new' }).click()
  await window.getByRole('dialog', { name: 'Add customer' }).getByLabel('Name', { exact: true }).fill(customerName)
  await window.getByRole('dialog', { name: 'Add customer' }).getByLabel('Mobile').fill('9999999999')
  await window.getByRole('dialog', { name: 'Add customer' }).getByRole('button', { name: 'Save' }).click()

  await expect(window.getByText(customerName).first()).toBeVisible()
})
