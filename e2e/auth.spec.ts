import { expect, test } from './fixtures/web-app'
import { seedShopName } from './helpers/seed'

test('login screen rejects bad credentials and accepts admin', async ({ window }) => {
  const shopName = 'Login Shop'
  await seedShopName(window, shopName)
  const origin = new URL(window.url()).origin
  await window.evaluate(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
  })
  await window.goto(`${origin}/login`)
  await expect(window.getByRole('heading', { name: shopName })).toBeVisible()
  await window.getByLabel('Username').fill('admin')
  await window.getByLabel('Password').fill('wrong')
  await window.getByRole('button', { name: 'Sign in' }).click()
  await expect(window.getByText(/Invalid username or password/i)).toBeVisible()

  await window.getByLabel('Password').fill('admin123')
  await window.getByRole('button', { name: 'Sign in' }).click()
  await expect(window.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 })
})

test('staff with only billing sees limited sidebar', async ({ window }) => {
  const origin = new URL(window.url()).origin

  await window.evaluate(async () => {
    async function api<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      })
      if (!response.ok) throw new Error(await response.text())
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'billstaff',
        password: 'staff123',
        role: 'staff',
        features: ['billing'],
      }),
    })
    await api('/api/auth/logout', { method: 'POST' })
  })

  await window.goto(`${origin}/login`)
  await window.getByLabel('Username').fill('billstaff')
  await window.getByLabel('Password').fill('staff123')
  await window.getByRole('button', { name: 'Sign in' }).click()

  // First login requires password change
  await expect(window.getByRole('heading', { name: 'Change password' })).toBeVisible()
  await window.getByLabel('Current password').fill('staff123')
  await window.getByLabel('New password', { exact: true }).fill('staff456')
  await window.getByLabel('Confirm new password').fill('staff456')
  await window.getByRole('button', { name: 'Save password' }).click()

  await expect(window.locator('.sidebar-nav').getByRole('link', { name: 'Billing' })).toBeVisible()
  await expect(window.locator('.sidebar-nav').getByRole('link', { name: 'Inventory' })).toHaveCount(0)
  await expect(window.locator('.sidebar-nav').getByRole('link', { name: 'Users' })).toHaveCount(0)

  await window.goto(`${origin}/products`)
  await expect(window.locator('.sidebar-nav').getByRole('link', { name: 'Billing' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Products' })).toHaveCount(0)
})
