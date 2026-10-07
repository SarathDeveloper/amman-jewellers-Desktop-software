import { expect, type Page } from '@playwright/test'

/**
 * The desktop sidebar is a collapsed icon rail that expands over the content
 * while the pointer rests on it. Clicking a nav link leaves the pointer inside
 * the expanded rail, which then covers the left edge of the page. Any click in
 * that band (the first module tab, the first table column) lands on the sidebar
 * instead. Park the pointer clear of the rail so it collapses, which is where a
 * user's pointer would be once they reach for something in the content.
 */
export async function parkPointer(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.mouse.move(Math.round(viewport.width * 0.7), Math.round(viewport.height * 0.5))
}

/**
 * Sidebar nav link (avoids duplicate links on the dashboard quick actions).
 *
 * Clicking parks the pointer, so callers can immediately click something along
 * the left edge of the content. Only `click` is exposed because that is all any
 * spec needs; parking has to happen on the click itself to cover every caller.
 */
export function sidebarLink(page: Page, name: string | RegExp) {
  const locator = page.locator('.sidebar-nav').getByRole('link', { name })
  return {
    click: async (): Promise<void> => {
      await locator.click()
      await parkPointer(page)
    },
  }
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
