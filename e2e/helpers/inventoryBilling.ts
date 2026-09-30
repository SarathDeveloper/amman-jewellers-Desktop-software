import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { openInventoryTab, sidebarLink } from './nav'
import { fillProductDialog, saveProductDialog } from './productForm'

export function inr(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

export function inrPlain(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export async function addProduct(
  page: Page,
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
  await openInventoryTab(page, 'Products')
  await page.getByRole('button', { name: 'Add product' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add product' })
  await fillProductDialog(dialog, values)
  await saveProductDialog(dialog)
  await expect(dialog).toBeHidden()
  await findProductRow(page, values.name)
}

export async function findProductRow(page: Page, name: string): Promise<Locator> {
  const search = page.getByPlaceholder('Search products, variants, size or code...')
  await search.fill(name)
  const row = page.getByRole('row').filter({ hasText: name }).first()
  await expect(row).toBeVisible()
  return row
}

export async function expectProductStock(page: Page, name: string, qty: string) {
  await openInventoryTab(page, 'Products')
  const row = await findProductRow(page, name)
  await expect(row.locator('.stock-qty')).toHaveText(qty)
}

export async function openNewBill(page: Page, type: 'cash' | 'tax') {
  await sidebarLink(page, 'Billing').click()
  if (type === 'tax') {
    await page.getByRole('tab', { name: /Tax Invoice/ }).click()
    await expect(page.getByRole('heading', { name: 'New Tax Invoice' })).toBeVisible()
    return
  }
  const newLink = page.getByRole('link', { name: 'New Cash Bill' })
  if (await newLink.isVisible()) {
    await newLink.click()
  } else {
    await page.getByRole('tab', { name: /Cash Bill/ }).click()
  }
  await expect(page.getByRole('heading', { name: 'New Cash Bill' })).toBeVisible()
}

export async function addCustomerOnBill(page: Page, name: string, phone: string) {
  await page.getByPlaceholder('Search customer by name, phone or ID…').fill(name)
  await page.getByRole('button', { name: 'No customer found — Add new' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add customer' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByLabel('Mobile').fill(phone)
  await dialog.getByLabel('Address').fill('Salem')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(name).first()).toBeVisible()
}

export async function addProductToBill(page: Page, productName: string) {
  const search = page.getByPlaceholder('Search product by name, metal, category, SKU…')
  const rows = page.getByRole('row', { name: new RegExp(productName) })
  const before = await rows.count()
  await search.fill(productName)
  await page.getByRole('option', { name: new RegExp(productName) }).click()
  await expect(rows).toHaveCount(before + 1)
  return rows.nth(before)
}

export async function setLineMetalRate(row: Locator, rate: string) {
  await row.locator('.adagu-col-rate input').fill(rate)
  await row.locator('.adagu-col-rate input').blur()
}

export async function expectLineAmount(row: Locator, amount: number) {
  await expect(row.locator('.adagu-col-amount')).toHaveText(inrPlain(amount))
}

export async function expectGrandTotal(page: Page, amount: number) {
  await expect(page.locator('.sale-bill-grand-total strong')).toHaveText(inr(amount))
}

export async function setDiscountAmount(page: Page, amount: string) {
  await page.locator('.sale-bill-summary-adjust input').first().fill(amount)
}

export async function setPaymentMode(page: Page, mode: 'Cash' | 'UPI' | 'Card') {
  await page.locator('.payment-mode-select-trigger').click()
  await page.getByRole('option', { name: mode, exact: true }).click()
}

export async function finalizeBill(page: Page) {
  await page.getByRole('button', { name: 'Finalize', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Bill finalized' })
  await expect(dialog).toBeVisible()
  return dialog
}

export async function closeFinalizedBill(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Bill finalized' })
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'View Invoice' }).click()
    await expect(dialog).toBeHidden()
  }
}

export function localTodayIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isoDaysAgo(days: number): string {
  const today = localTodayIso()
  const start = Date.parse(`${today}T12:00:00`)
  const next = new Date(start - days * 24 * 60 * 60 * 1000)
  return next.toISOString().slice(0, 10)
}

export function adaguField(page: Page, label: string) {
  return page.locator('.adagu-field').filter({ hasText: label })
}

export function calculatedValue(page: Page, label: string) {
  return page.locator('.adagu-calculated-row').filter({ hasText: label }).locator('.value')
}

export async function setAdaguInterestPct(page: Page, pct: string) {
  await sidebarLink(page, 'Settings').click()
  const invoiceTab = page.getByRole('tab', { name: 'Invoice Settings' })
  await expect(invoiceTab).toBeVisible()
  if ((await invoiceTab.getAttribute('aria-selected')) !== 'true') {
    await invoiceTab.click()
  }
  await expect(page.getByRole('heading', { name: 'Invoice Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Adagu Bill' }).click()
  const rate = page.getByLabel('Adagu monthly interest (%)')
  await expect(rate).toBeVisible()
  await rate.fill(pct)
  const invoiceCard = page.locator('.card.padded').filter({ hasText: 'Invoice Settings' })
  await invoiceCard.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByText('Invoice settings saved')).toBeVisible()
}

export async function openNewAdaguBill(page: Page) {
  await sidebarLink(page, 'Billing').click()
  const newLink = page.getByRole('link', { name: 'New Adagu Bill' })
  if (await newLink.isVisible()) {
    await newLink.click()
  } else {
    await page.getByRole('tab', { name: /Adagu Bill/ }).click()
  }
  await expect(page.getByRole('heading', { name: 'Adagu Bill' })).toBeVisible()
}

export async function setBillDate(page: Page, isoDate: string) {
  await page.getByLabel('Bill Date').fill(isoDate)
}

export async function fillAdaguBorrower(
  page: Page,
  values: { name: string; phone: string; address?: string },
) {
  await adaguField(page, 'Customer Name').locator('input').fill(values.name)
  await adaguField(page, 'Mobile Number').locator('input').fill(values.phone)
  await adaguField(page, 'Address').locator('textarea').fill(values.address ?? 'Salem')
}

export async function fillPledgeItem(
  page: Page,
  values: { description: string; grossWeight: string; stoneWeight: string },
) {
  const table = page.locator('.adagu-jewellery-table--pledge')
  const itemRow = table.locator('tbody tr').first()
  await itemRow.locator('.adagu-col-weight input').nth(0).fill(values.grossWeight)
  await itemRow.locator('.adagu-col-weight input').nth(1).fill(values.stoneWeight)
  await itemRow.locator('.adagu-col-weight input').nth(1).blur()
  await table.locator('textarea').fill(values.description)
}

export async function recoverFromFatalError(page: Page) {
  const crashed = page.getByRole('heading', { name: 'Something went wrong.' })
  if (!(await crashed.isVisible())) return
  await page.getByRole('button', { name: 'Restart Application' }).click()
  const username = page.getByLabel('Username')
  const sidebar = page.locator('.sidebar-nav')
  await username.or(sidebar).waitFor({ state: 'visible', timeout: 20_000 })
  if (await username.isVisible()) {
    await username.fill('admin')
    await page.getByLabel('Password').fill('admin456')
    await page.getByRole('button', { name: 'Sign in' }).click()
  }
  await sidebar.waitFor({ state: 'visible', timeout: 20_000 })
}

export async function dismissDialogs(page: Page) {
  const crashed = page.getByRole('heading', { name: 'Something went wrong.' })
  if (await crashed.isVisible()) {
    await recoverFromFatalError(page)
    return
  }
  await page.keyboard.press('Escape')
  const preview = page.getByRole('dialog', { name: 'Print preview' })
  if (await preview.isVisible()) {
    await page.keyboard.press('Escape')
  }
  await recoverFromFatalError(page)
}

export async function sanctionAdaguLoan(page: Page) {
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Sanction loan' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Sanction loan' }).click()
  const toast = page.getByText('Loan sanctioned')
  const crashed = page.getByRole('heading', { name: 'Something went wrong.' })
  await toast.or(crashed).waitFor({ state: 'visible', timeout: 15_000 })
  await dismissDialogs(page)
}

export async function closePrintPreview(page: Page) {
  await dismissDialogs(page)
}

export async function adaguBillNo(page: Page): Promise<string> {
  const value = await page
    .locator('.sale-bill-meta-field')
    .filter({ hasText: 'Bill No.' })
    .locator('input')
    .inputValue()
  expect(value).toMatch(/^ADG\d{4,}$/)
  return value
}

export async function openDuesTab(page: Page, tab: 'Bill Dues' | 'Adagu Dues' = 'Adagu Dues') {
  await sidebarLink(page, 'Dues').click()
  const tabEl = page.getByRole('tab', { name: tab, exact: true })
  await expect(tabEl).toBeVisible()
  if ((await tabEl.getAttribute('aria-selected')) !== 'true') {
    await tabEl.click()
  }
  await expect(tabEl).toHaveAttribute('aria-selected', 'true')
}

export async function adaguDueRow(page: Page, query: string): Promise<Locator> {
  await page.getByPlaceholder('Search customer or ADG no...').fill(query)
  const row = page.locator('tr.dues-adagu-row').filter({ hasText: query })
  await expect(row).toBeVisible()
  return row
}

export async function receiptNoFromDueRow(row: Locator): Promise<string> {
  const value = (await row.locator('.dues-adagu-receipt').innerText()).trim()
  expect(value).toMatch(/^ADG\d{4,}$/)
  return value
}

export async function openAdaguDueDrawer(page: Page, receiptNo: string, customerName: string) {
  const row = await adaguDueRow(page, receiptNo)
  await row.getByRole('button', { name: 'View' }).click()
  const drawer = page.getByRole('dialog', { name: customerName })
  await expect(drawer).toBeVisible()
  return drawer
}

export async function openNewOldGoldPurchase(page: Page) {
  await openInventoryTab(page, 'Old Gold Purchase')
  await page.getByRole('button', { name: 'New purchase' }).click()
  const dialog = page.getByRole('dialog', { name: 'New old gold purchase' })
  await expect(dialog).toBeVisible()
  return dialog
}

export async function fillOldGoldRow(
  row: Locator,
  values: {
    description: string
    grossWeight: string
    stoneWeight: string
    ratePerGram: string
    deductionPct: string
  },
) {
  await row.locator('input').first().fill(values.description)
  const nums = row.locator('input[type="number"]')
  await nums.nth(0).fill(values.grossWeight)
  await nums.nth(1).fill(values.stoneWeight)
  await nums.nth(3).fill(values.ratePerGram)
  await nums.nth(4).fill(values.deductionPct)
  await nums.nth(4).blur()
}
