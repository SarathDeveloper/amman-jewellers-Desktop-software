import { expect, test } from './fixtures/web-app'

test('dashboard shows KPI cards', async ({ window }) => {
  await expect(window.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(window.getByText('GOLD22 KT/1g', { exact: false })).toBeVisible()
  await expect(window.getByText('SILVER/1g', { exact: false })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Adagu reminders' })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Outstanding customers' })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Overdue bill dues' })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Scheme installments overdue' })).toBeVisible()
  await expect(window.locator('.kpi-label', { hasText: 'Scheme dues this week' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Stock by category' })).toBeVisible()
  await expect(window.getByRole('tab', { name: 'Gold' })).toBeVisible()
  await expect(window.getByRole('tab', { name: 'Silver' })).toBeVisible()
})
