import type { Locator, Page } from '@playwright/test'

export async function fillProductDialog(
  dialog: Locator | Page,
  values: {
    name: string
    category: string
    metal?: string
    purity?: string
    grossWeight: string
    netWeight: string
    makingCharges?: string
    stockQty: string
  },
) {
  await dialog.getByLabel('Product name').fill(values.name)
  await dialog.getByLabel('Category').selectOption(values.category)
  await dialog.getByLabel('Metal').selectOption(values.metal ?? 'Gold')
  await dialog.getByLabel('Purity').selectOption(values.purity ?? '22K')
  await dialog.getByLabel('Gross weight').fill(values.grossWeight)
  await dialog.getByLabel('Net weight').fill(values.netWeight)
  if (values.makingCharges != null) {
    await dialog.getByLabel('Making charges').fill(values.makingCharges)
  }
  await dialog.getByLabel('Stock quantity').fill(values.stockQty)
}

export async function saveProductDialog(dialog: Locator | Page) {
  await dialog.getByRole('button', { name: 'Save product' }).click()
}
