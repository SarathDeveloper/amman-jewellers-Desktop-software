/**
 * Executable manual QA checklist for New Quotation.
 * Run: npm run build && npx playwright test e2e/billing-manual-qa.spec.ts
 */
import { expect, test } from './fixtures/web-app'
import { localTodayIso } from './helpers/dates'
import { openInventoryTab, sidebarLink, expectPrintPreviewModal } from './helpers/nav'
import { fillProductDialog, saveProductDialog } from './helpers/productForm'

test.describe('Manual QA: New bill generation', () => {
  test('full new bill flow — UI, customer, lines, draft, finalize', async ({ window }) => {
    const today = localTodayIso()
    const productName = `QA Gold Ring ${Date.now()}`
    const customerName = `QA Customer ${Date.now()}`

    // --- Products setup ---
    await openInventoryTab(window, 'Products')
    await window.getByRole('button', { name: 'Add product' }).click()
    const productDialog = window.getByRole('dialog', { name: 'Add product' })
    await fillProductDialog(productDialog, {
      name: productName,
      category: 'Ring',
      grossWeight: '6',
      netWeight: '5',
      makingCharges: '500',
      stockQty: '5',
    })
    await saveProductDialog(productDialog)
    await expect(window.getByRole('row').filter({ hasText: productName })).toBeVisible()

    // --- Open New bill ---
    await sidebarLink(window, 'Billing').click()
    await window.getByRole('tab', { name: /Quotation/ }).click()
    await window.getByRole('link', { name: 'New Quotation' }).click()
    await expect(window.getByRole('heading', { name: 'New Quotation' })).toBeVisible()
    await expect(window.getByPlaceholder('Search customer by name, phone or ID…')).toBeVisible()
    await expect(window.getByLabel('Bill date')).toBeVisible()
    await expect(window.getByRole('heading', { name: 'Bill Summary' })).toBeVisible()
    await expect(window.getByPlaceholder('Search product by name, metal, category, SKU…')).toBeVisible()
    await expect(window.getByRole('button', { name: 'Add Item' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Finalize', exact: true })).toBeVisible()

    // --- New customer on bill page ---
    await window.getByPlaceholder('Search customer by name, phone or ID…').fill(customerName)
    await window.getByRole('button', { name: 'No customer found — Add new' }).click()
    const customerDialog = window.getByRole('dialog', { name: 'Add customer' })
    await customerDialog.getByLabel('Name', { exact: true }).fill(customerName)
    await customerDialog.getByLabel('Mobile').fill('9876501234')
    await customerDialog.getByLabel('Address').fill('Salem')
    await customerDialog.getByRole('button', { name: 'Save' }).click()
    await expect(window.getByText(customerName).first()).toBeVisible()

    await window.getByLabel('Bill date').fill(today)

    // --- Add the product from search ---
    await window.getByPlaceholder('Search product by name, metal, category, SKU…').fill(productName)
    await window.getByRole('option', { name: new RegExp(productName) }).click()
    const itemRow = window.locator('.sale-bill-items-table tbody tr').filter({
      has: window.locator(`.sale-bill-product-name[value*="${productName}"]`),
    })
    await expect(itemRow).toBeVisible()
    await itemRow.getByLabel('Gold rate').fill('6200')
    await expect(window.locator('.sale-bill-summary-stat', { hasText: 'Total Items' }).locator('strong')).toHaveText('1')

    // --- Payment + discount ---
    await window.locator('.sale-bill-summary-adjust').filter({ hasText: 'Discount' }).locator('input').fill('5')
    await window.locator('.payment-mode-select-trigger').click()
    await window.getByRole('option', { name: 'UPI', exact: true }).evaluate((el) => {
      ;(el as HTMLButtonElement).click()
    })

    // --- Save draft ---
    await window.getByRole('button', { name: 'Save draft' }).first().click()
    await expect(window.locator('.sale-bill-meta-status')).toHaveText('Draft')
    const billNo = window.locator('.sale-bill-meta-field').filter({ hasText: 'Bill No.' }).locator('input')
    await expect(billNo).not.toHaveValue('')
    await expect(billNo).not.toHaveValue('…')

    // --- Print preview opens modal path (save already done) ---
    await window.getByRole('button', { name: 'Preview', exact: true }).click()
    const previewDialog = await expectPrintPreviewModal(window)
    await previewDialog.getByRole('button', { name: 'Close' }).click()
    await expect(previewDialog).toBeHidden()

    // --- Finalize ---
    await window.getByRole('button', { name: 'Finalize', exact: true }).click()
    const finalized = window.getByRole('dialog', { name: 'Bill finalized' })
    await expect(finalized).toBeVisible()
    await expect(window.locator('.sale-bill-meta-status')).not.toHaveText('Draft')
    await window.locator('.modal-backdrop').click({ position: { x: 8, y: 8 } })
    await expect(finalized).toBeHidden()

    // --- Stock deducted ---
    await openInventoryTab(window, 'Products')
    const row = window.getByRole('row').filter({ hasText: productName })
    await expect(row.locator('.stock-qty')).toHaveText('4')
  })

  test('reset clears draft fields on new bill', async ({ window }) => {
    await sidebarLink(window, 'Billing').click()
    await window.getByRole('tab', { name: /Quotation/ }).click()
    await window.getByRole('link', { name: 'New Quotation' }).click()

    await window.getByPlaceholder('Search customer by name, phone or ID…').fill('nobody-here')
    await window.getByRole('button', { name: 'No customer found — Add new' }).click()
    await window.getByRole('dialog', { name: 'Add customer' }).getByLabel('Name', { exact: true }).fill('Reset Test')
    await window.getByRole('dialog', { name: 'Add customer' }).getByLabel('Mobile').fill('9876500000')
    await window.getByRole('dialog', { name: 'Add customer' }).getByLabel('Address').fill('Salem')
    await window.getByRole('dialog', { name: 'Add customer' }).getByRole('button', { name: 'Save' }).click()
    await expect(window.getByText('Reset Test').first()).toBeVisible()

    await window.getByRole('button', { name: 'Reset' }).click()
    await window.getByRole('dialog', { name: 'Reset bill' }).getByRole('button', { name: 'Reset' }).click()

    await expect(window.getByPlaceholder('Search customer by name, phone or ID…')).toHaveValue('')
    await expect(window.getByText('Reset Test')).toHaveCount(0)
    await expect(window.locator('.sale-bill-items-table tbody tr')).toHaveCount(0)
  })
})
