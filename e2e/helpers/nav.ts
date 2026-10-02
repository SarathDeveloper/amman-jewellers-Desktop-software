import { expect, type Page } from '@playwright/test'

/** Sidebar nav link (avoids duplicate links on the dashboard quick actions). */
export function sidebarLink(page: Page, name: string | RegExp) {
  return page.locator('.sidebar-nav').getByRole('link', { name })
}

/** Open a Monthly Gold Savings chrome tab. */
export async function openGoldSavingsTab(
  page: Page,
  tab: 'Dashboard' | 'Schemes' | 'Enroll' | 'Accounts' | 'Collections' | 'Ledger' | 'Maturity' | 'Overdue' | 'Reports',
) {
  await sidebarLink(page, 'Gold Savings').click()
  const tabEl = page.locator('.billing-chrome').getByRole('tab', { name: tab, exact: true })
  await expect(tabEl).toBeVisible()
  if ((await tabEl.getAttribute('aria-selected')) !== 'true') {
    await tabEl.click()
  }
  await expect(tabEl).toHaveAttribute('aria-selected', 'true')
}

/** Open an Inventory hub tab (Products, Gold & Silver, Purchase, Old Gold Purchase, or Suppliers). */
export async function openInventoryTab(
  page: Page,
  tab: 'Products' | 'Gold & Silver' | 'Purchase' | 'Old Gold Purchase' | 'Suppliers',
) {
  await sidebarLink(page, 'Inventory').click()
  const tabEl = page.getByRole('tab', { name: tab, exact: true })
  await expect(tabEl).toBeVisible()
  if ((await tabEl.getAttribute('aria-selected')) !== 'true') {
    await tabEl.click()
  }
  await expect(tabEl).toHaveAttribute('aria-selected', 'true')
}

/** Print/preview stays in a dialog; the app URL must not change to /print/. */
export async function expectPrintPreviewModal(page: Page, title = 'Print preview') {
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(page).not.toHaveURL(/\/print\//)
  return dialog
}
