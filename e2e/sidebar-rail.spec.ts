import { expect, test } from './fixtures/web-app'
import { openInventoryTab, sidebarLink } from './helpers/nav'

/**
 * The desktop rail used to widen to 15.5rem on hover, which laid it straight over the
 * left edge of the content — the module tab row and the first table column — and
 * swallowed clicks there. It now keeps its collapsed width and floats the label
 * beside itself instead, so the content under it is never covered.
 */
test('sidebar rail keeps its width and labels the hovered icon', async ({ window }) => {
  // Desktop Chrome is 1280x720, so this exercises the rail rather than the drawer.
  expect(window.viewportSize()?.width ?? 0).toBeGreaterThan(1024)

  await openInventoryTab(window, 'Products')
  await expect(window.getByRole('heading', { name: 'Products' })).toBeVisible()

  const rail = window.locator('#app-sidebar')
  const content = window.locator('.content')
  const collapsed = await rail.evaluate((el) => el.getBoundingClientRect().width)

  // The rail and the content must not overlap, hovered or not.
  const overlapsContent = async () => {
    const railBox = await rail.boundingBox()
    const contentBox = await content.boundingBox()
    if (!railBox || !contentBox) throw new Error('rail or content has no box')
    return railBox.x + railBox.width > contentBox.x
  }
  expect(await overlapsContent()).toBe(false)

  await window.locator('.sidebar-nav .nav-link').first().hover()
  const chip = window.locator('.nav-tooltip')
  await expect(chip).toBeVisible()
  await expect(chip).toHaveText('Dashboard')

  // The chip sits beside the rail and is actually painted (it would otherwise be a
  // transparent box, or clipped to nothing by the rail's own overflow).
  const railBox = await rail.boundingBox()
  const chipBox = await chip.boundingBox()
  if (!railBox || !chipBox) throw new Error('rail or chip has no box')
  expect(chipBox.x).toBeGreaterThanOrEqual(railBox.x + railBox.width)
  expect(await chip.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')

  // Hovering must not widen the rail over the content.
  expect(await rail.evaluate((el) => el.getBoundingClientRect().width)).toBe(collapsed)
  expect(await overlapsContent()).toBe(false)

  // The module tab row stays clickable while the rail is hovered.
  await window.getByRole('tab', { name: 'Gold & Silver' }).click()
  await expect(window.getByRole('tab', { name: 'Gold & Silver' })).toHaveAttribute('aria-selected', 'true')

  // The chip follows the pointer away.
  await expect(window.locator('.nav-tooltip')).toBeHidden()
})

test('sidebar rail floats the sign out label instead of widening', async ({ window }) => {
  await sidebarLink(window, 'Customers').click()
  await expect(window.getByRole('heading', { name: 'Customers' })).toBeVisible()

  const rail = window.locator('#app-sidebar')
  const collapsed = await rail.evaluate((el) => el.getBoundingClientRect().width)

  await window.getByRole('button', { name: 'Sign out' }).hover()
  await expect(window.locator('.nav-tooltip')).toHaveText('Sign out')
  expect(await rail.evaluate((el) => el.getBoundingClientRect().width)).toBe(collapsed)
})
