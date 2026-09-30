/**
 * Executable manual QA checklist for New Cash Bill.
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
    await window.getByRole('tab', { name: /Cash Bill/ }).click()
    await window.getByRole('link', { name: 'New Cash Bill' }).click()
    await expect(window.getByRole('heading', { name: 'New Cash Bill' })).toBeVisible()
    await expect(window.getByPlaceholder('Search customer by name, phone or ID…')).toBeVisible()
    await expect(window.getByLabel('Bill date')).toBeVisible()
    await expect(window.getByRole('heading', { name: 'Bill summary' })).toBeVisible()
    await expect(window.getByRole('tab', { name: 'Add from products' })).toBeVisible()
    await expect(window.getByRole('tab', { name: 'Scan barcode' })).toBeVisible()
    await expect(window.getByRole('tab', { name: 'Quick add (Manual)' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Finalize & Print' })).toBeVisible()

    // --- New customer on bill page ---
    await window.getByPlaceholder('Search customer by name, phone or ID…').fill(customerName)
    await window.getByRole('button', { name: 'No customer found — Add new' }).click()
    const customerDialog = window.getByRole('dialog', { name: 'Add customer' })
    await customerDialog.getByLabel('Name', { exact: true }).fill(customerName)
    await customerDialog.getByLabel('Mobile').fill('9876501234')
    await customerDialog.getByRole('button', { name: 'Save' }).click()
    await expect(window.getByText(customerName).first()).toBeVisible()

    await window.getByLabel('Bill date').fill(today)

    // --- Manual add row ---
    await window.getByRole('tab', { name: 'Quick add (Manual)' }).click()
    await window.locator('.billing-add-row--primary select.select').selectOption({
      label: productName,
    })
    await window.locator('.billing-add-row--weights input[type="number"]').nth(1).fill('6200')
    await window.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(window.locator('tbody tr')).toHaveCount(1)
    await expect(window.getByText('Items').locator('..').getByRole('strong')).not.toHaveText('0')

    // --- Payment + discount ---
    await window.getByLabel('Discount (%)').fill('5')
    await window.getByRole('button', { name: 'UPI' }).click()

    // --- Save draft ---
    await window.getByRole('button', { name: 'Save draft' }).first().click()
    await expect(window.locator('.badge.draft')).toBeVisible()
    await expect(window.getByLabel('Bill No.')).not.toHaveValue('')

    // --- Print preview opens modal path (save already done) ---
    await window.getByRole('button', { name: 'Preview', exact: true }).click()
    const previewDialog = await expectPrintPreviewModal(window)
    await previewDialog.getByRole('button', { name: 'Close' }).click()
    await expect(previewDialog).toBeHidden()

    // --- Finalize ---
    await window.getByRole('button', { name: 'Finalize', exact: true }).click()
    await expect(window.locator('.badge.final')).toBeVisible()

    // --- Stock deducted ---
    await openInventoryTab(window, 'Products')
    const row = window.getByRole('row').filter({ hasText: productName })
    await expect(row.locator('.stock-qty')).toHaveText('4')
  })

  test('reset clears draft fields on new bill', async ({ window }) => {
    await sidebarLink(window, 'Billing').click()
    await window.getByRole('tab', { name: /Cash Bill/ }).click()
    await window.getByRole('link', { name: 'New Cash Bill' }).click()

    await window.getByPlaceholder('Search customer by name, phone or ID…').fill('nobody-here')
    await window.getByRole('button', { name: 'No customer found — Add new' }).click()
    await window.getByRole('dialog', { name: 'Add customer' }).getByLabel('Name', { exact: true }).fill('Reset Test')
    await window.getByRole('dialog', { name: 'Add customer' }).getByLabel('Mobile').fill('9876500000')
    await window.getByRole('dialog', { name: 'Add customer' }).getByRole('button', { name: 'Save' }).click()

    await window.getByRole('tab', { name: 'Quick add (Manual)' }).click()
    await window.getByRole('button', { name: 'Reset' }).click()
    await window.getByRole('dialog', { name: 'Reset bill' }).getByRole('button', { name: 'Reset' }).click()

    await expect(window.getByPlaceholder('Search customer by name, phone or ID…')).toHaveValue('')
    await expect(window.getByText('No items yet. Add products above.')).toBeVisible()
  })
})
