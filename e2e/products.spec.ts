import { expect, test } from './fixtures/web-app'
import { openInventoryTab } from './helpers/nav'
import { fillHuidFields, fillProductDialog, saveProductDialog } from './helpers/productForm'
import type { Page } from '@playwright/test'

async function openProductDetail(page: Page, name: string) {
  const row = page.getByRole('row').filter({ hasText: name })
  await row.locator('.products-variant-copy').click()
  return page.getByRole('dialog', { name: new RegExp(name) })
}

test('products CRUD', async ({ window }) => {
  await openInventoryTab(window, 'Products')
  await expect(window.getByRole('heading', { name: 'Products' })).toBeVisible()

  await window.getByRole('button', { name: 'Add product' }).click()
  const addDialog = window.getByRole('dialog', { name: 'Add product' })
  await fillProductDialog(addDialog, {
    name: 'E2E Product',
    category: 'Chain',
    grossWeight: '10',
    netWeight: '9',
    makingCharges: '0',
    stockQty: '4',
  })
  await saveProductDialog(addDialog)

  const createdRow = window.getByRole('row').filter({ hasText: 'E2E Product' })
  await expect(createdRow).toBeVisible()

  const detail = await openProductDetail(window, 'E2E Product')
  await expect(detail.getByText('General details')).toBeVisible()
  await detail.getByRole('button', { name: 'Edit' }).click()

  const editDialog = window.getByRole('dialog', { name: 'Edit product' })
  await editDialog.getByLabel('Product name').fill('E2E Product Updated')
  await editDialog.getByLabel('Stock quantity').fill('8')
  await fillHuidFields(editDialog, 4, 4)
  await saveProductDialog(editDialog)
  await expect(window.getByRole('row').filter({ hasText: 'E2E Product Updated' })).toBeVisible()
  await expect(window.getByRole('row').filter({ hasText: 'E2E Product Updated' }).locator('.stock-qty')).toHaveText(
    '8',
  )

  await detail.getByRole('button', { name: 'Delete' }).click()
  await window.getByRole('dialog', { name: 'Delete product' }).getByRole('button', { name: 'Delete' }).click()
  await expect(window.getByText('No products yet')).toBeVisible()
})
