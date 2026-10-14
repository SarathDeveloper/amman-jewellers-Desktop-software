import { expect, test } from './fixtures/web-app'
import { localTodayIso } from './helpers/dates'
import { openInventoryTab, sidebarLink } from './helpers/nav'
import { fillProductDialog, saveProductDialog } from './helpers/productForm'
import { pickFirstHuid } from './helpers/inventoryBilling'
import { seedTaggedProduct } from './helpers/seed'

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
  await window.getByLabel('Address').fill('Salem')
  await window.getByRole('button', { name: 'Save' }).click()

  await sidebarLink(window, 'Billing').click()
  await expect(window.getByRole('tab', { name: /Quotation/ })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Reprint last' })).toBeVisible()
  await window.getByRole('tab', { name: /Quotation/ }).click()
  await expect(window.getByRole('heading', { name: 'New Quotation' })).toBeVisible()

  const customerSearch = window.getByPlaceholder('Search customer by name, phone or ID…')
  await customerSearch.fill('Bill Customer')
  await window.getByRole('option', { name: /Bill Customer/ }).click()

  await window.getByLabel('Bill date').fill(today)

  await window.getByPlaceholder('Search product by name, metal, category, SKU…').fill(productName)
  await window.getByRole('option', { name: new RegExp(productName) }).click()
  const itemRow = window.locator('.sale-bill-items-table tbody tr').filter({
    has: window.locator(`.sale-bill-product-name[value*="${productName}"]`),
  })
  await expect(itemRow).toBeVisible()
  await pickFirstHuid(itemRow)
  await itemRow.getByLabel('Gold rate').fill('1500')

  await window.getByRole('button', { name: 'Save draft' }).first().click()
  await expect(window.locator('.sale-bill-meta-status')).toHaveText('Draft')

  await window.getByRole('button', { name: 'Finalize', exact: true }).click()
  await expect(window.locator('.sale-bill-meta-status')).toHaveText('Paid')
  const finalized = window.getByRole('dialog', { name: 'Bill finalized' })
  await expect(finalized).toBeVisible()
  await window.locator('.modal-backdrop').click({ position: { x: 8, y: 8 } })
  await expect(finalized).toBeHidden()

  await openInventoryTab(window, 'Products')
  const row = window.getByRole('row').filter({ hasText: productName })
  await expect(row.locator('.stock-qty')).toHaveText('2')
})

test('billing add customer from new bill page', async ({ window }) => {
  const customerName = `Counter Sale ${Date.now()}`

  await sidebarLink(window, 'Billing').click()
  await window.getByRole('tab', { name: /Quotation/ }).click()

  await window.getByPlaceholder('Search customer by name, phone or ID…').fill(customerName)
  await window.getByRole('button', { name: 'No customer found — Add new' }).click()
  await window.getByRole('dialog', { name: 'Add customer' }).getByLabel('Name', { exact: true }).fill(customerName)
  await window.getByRole('dialog', { name: 'Add customer' }).getByLabel('Mobile').fill('9999999999')
  await window.getByRole('dialog', { name: 'Add customer' }).getByLabel('Address').fill('Salem')
  await window.getByRole('dialog', { name: 'Add customer' }).getByRole('button', { name: 'Save' }).click()

  await expect(window.getByText(customerName).first()).toBeVisible()
})

test('typing a tagged HUID on the empty bill row adds that piece', async ({ window }) => {
  const stamp = Date.now()
  const productName = `Scan Item ${stamp}`
  const huid = `H${String(stamp).slice(-5)}`
  await seedTaggedProduct(window, { name: productName, huid })

  await sidebarLink(window, 'Billing').click()
  await window.getByRole('tab', { name: /Quotation/ }).click()
  await expect(window.getByRole('heading', { name: 'New Quotation' })).toBeVisible()

  await window.getByRole('button', { name: 'Add Item' }).click()
  const emptyRow = window.locator('.sale-bill-items-table tbody tr').last()
  await expect(emptyRow.locator('.sale-bill-huid-input')).toBeEnabled()
  await emptyRow.locator('.sale-bill-huid-input').fill(huid)

  const itemRow = window.locator('.sale-bill-items-table tbody tr').filter({
    has: window.locator(`.sale-bill-product-name[value*="${productName}"]`),
  })
  await expect(itemRow).toBeVisible()
  await expect(itemRow.locator('.sale-bill-huid-input')).toHaveValue(huid)
})

test('manual item add opens a second row and autofills the metal rate', async ({ window }) => {
  const today = localTodayIso()
  await window.evaluate(async (date) => {
    const response = await fetch('/api/metal-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        effectiveDate: date,
        gold24k: 7640,
        gold22k: 7000,
        gold20k: 6370,
        gold18k: 5730,
        silverFine: 98,
        silver925: 91,
      }),
    })
    if (!response.ok) throw new Error(await response.text())
  }, today)

  await sidebarLink(window, 'Billing').click()
  await window.getByRole('tab', { name: /Tax Invoice/ }).click()
  await expect(window.getByRole('heading', { name: 'New Tax Invoice' })).toBeVisible()

  const rows = window.locator('.sale-bill-items-table tbody tr')
  await expect(rows).toHaveCount(0)

  await window.getByRole('button', { name: 'Add Item' }).click()
  await expect(rows).toHaveCount(1)
  const first = rows.nth(0)
  await expect(first.getByLabel('Gold rate')).toHaveValue('7000')

  await first.locator('.sale-bill-huid-input').fill('HI763837')
  await first.locator('.adagu-col-net-weight input').fill('8')
  await first.locator('.adagu-col-weight input').fill('7.5')
  const beforeAdd = await rows.count()
  await window.getByRole('button', { name: 'Add Item' }).click()
  await expect(rows).toHaveCount(beforeAdd + 1)
  await expect(first.locator('.sale-bill-huid-input')).toHaveValue('HI763837')
  await expect(first.locator('.adagu-col-amount')).toHaveText('₹56,000')

  await first.locator('.sale-bill-product-name').fill('Ring', { force: true })
  await expect(first.getByLabel('Gold rate')).toHaveValue('7000')
  await expect(window.locator('.sale-bill-summary-stat', { hasText: 'Total Items' }).locator('strong')).toHaveText(
    '1',
  )

  const nextLine = rows.nth(1)
  await expect(nextLine.getByLabel('Gold rate')).toHaveValue('7000')
  await nextLine.locator('.sale-bill-product-name').fill('Chain', { force: true })
  await expect(rows.nth(0).locator('.sale-bill-product-name')).toHaveValue('Ring')
  await expect(nextLine.locator('.sale-bill-product-name')).toHaveValue('Chain')
})
