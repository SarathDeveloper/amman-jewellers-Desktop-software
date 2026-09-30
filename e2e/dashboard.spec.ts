import { expect, test } from './fixtures/web-app'

test('dashboard shows KPI cards', async ({ window }) => {
  await expect(window.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(window.getByText('GOLD22 KT/1g', { exact: false })).toBeVisible()
  await expect(window.getByText('SILVER/1g', { exact: false })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: "Today's sales" })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Outstanding' })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Gold closing' })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Silver closing' })).toBeVisible()
})
