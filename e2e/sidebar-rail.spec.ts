import { expect, type Locator } from '@playwright/test'
import { test } from './fixtures/web-app'
import { openInventoryTab, parkPointer, sidebarLink } from './helpers/nav'

/**
 * On desktop the rail stays collapsed until the pointer rests on it, then it widens
 * over the content to show its labels and collapses again once the pointer leaves.
 */
test('sidebar rail expands on hover and collapses when the pointer leaves', async ({ window }) => {
  expect(window.viewportSize()?.width ?? 0).toBeGreaterThan(1024)

  await openInventoryTab(window, 'Products')
  await expect(window.getByRole('heading', { name: 'Products' })).toBeVisible()

  const rail = window.locator('#app-sidebar')
  const nav = window.locator('.sidebar-nav')
  const collapsed = await rail.evaluate((el) => el.getBoundingClientRect().width)
  expect(collapsed).toBeLessThan(100)

  const dashboard = window.locator('.sidebar-nav').getByRole('link', { name: 'Dashboard' })
  expect(await labelFitsRail(dashboard)).toBe(false)
  await expect(window.locator('.brand-text')).toHaveCSS('opacity', '0')
  expect(await navHasHorizontalOverflow(nav)).toBe(false)

  await dashboard.hover()
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(200)
  expect(await labelFitsRail(dashboard)).toBe(true)
  await expect(window.locator('.sidebar-logout-label')).toHaveCSS('opacity', '1')
  expect(await navHasHorizontalOverflow(nav)).toBe(false)

  await parkPointer(window)
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(collapsed, 0)
  expect(await labelFitsRail(dashboard)).toBe(false)
})

test('sidebar rail expands to show the sign out label', async ({ window }) => {
  await sidebarLink(window, 'Customers').click()
  await expect(window.getByRole('heading', { name: 'Customers' })).toBeVisible()

  const rail = window.locator('#app-sidebar')
  const collapsed = await rail.evaluate((el) => el.getBoundingClientRect().width)

  await window.getByRole('button', { name: 'Sign out' }).hover()
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(collapsed + 100)
  await expect(window.locator('.sidebar-logout-label')).toHaveCSS('opacity', '1')
  await expect(window.locator('.nav-tooltip')).toHaveCount(0)

  await parkPointer(window)
  await expect.poll(() => rail.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(collapsed, 0)
})

/** The link label is clipped by the collapsed rail and fully inside it once expanded. */
async function labelFitsRail(link: Locator) {
  return link.evaluate((el) => {
    const rail = el.closest('.sidebar')?.getBoundingClientRect()
    const text = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    if (!rail || !text) return false
    const range = document.createRange()
    range.selectNodeContents(text)
    const rect = range.getBoundingClientRect()
    return rect.width > 0 && rect.left >= rail.left && rect.right <= rail.right + 1
  })
}

async function navHasHorizontalOverflow(nav: Locator) {
  return nav.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
}
