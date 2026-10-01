import type { Locator, Page } from '@playwright/test'

let huidSerial = 0

function nextHuid(): string {
  huidSerial += 1
  return `E${String(huidSerial).padStart(5, '0')}`
}

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
  const qty = Math.max(0, Number.parseInt(values.stockQty, 10) || 0)
  for (let index = 0; index < qty; index += 1) {
    await dialog.getByLabel(`HUID ${index + 1}`).fill(nextHuid())
  }
}

export async function fillHuidFields(dialog: Locator | Page, fromIndex: number, count: number) {
  for (let index = 0; index < count; index += 1) {
    await dialog.getByLabel(`HUID ${fromIndex + index + 1}`).fill(nextHuid())
  }
}

export async function saveProductDialog(dialog: Locator | Page) {
  await dialog.getByRole('button', { name: 'Save product' }).click()
}
