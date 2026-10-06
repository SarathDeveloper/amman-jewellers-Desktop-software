import { test as base, type Page } from '@playwright/test'

const ORIGIN = 'http://127.0.0.1:5173'
const ADMIN_USER = 'admin'
const ADMIN_PASSWORD = 'admin456'

async function waitForLiveApp(page: Page): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await page.request.get(ORIGIN, { timeout: 2_000 })
      if (response.status() < 500) return
      lastError = new Error(`Live app returned HTTP ${response.status()}`)
    } catch (error) {
      lastError = error
    }
    await page.waitForTimeout(500)
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '')
  throw new Error(
    `Tauri app is not reachable at ${ORIGIN}. Start it with: npm run tauri:dev\n${detail}`,
  )
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  const username = page.getByLabel('Username')
  const sidebar = page.locator('.sidebar-nav')
  await username.or(sidebar).waitFor({ state: 'visible', timeout: 20_000 })

  if (page.url().includes('change-password')) {
    throw new Error('Admin must finish the password change before live Tauri E2E tests can run')
  }

  if (await username.isVisible()) {
    await username.fill(ADMIN_USER)
    await page.getByLabel('Password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
  }

  await sidebar.waitFor({ state: 'visible', timeout: 20_000 })
  if (page.url().includes('change-password')) {
    throw new Error('Admin must finish the password change before live Tauri E2E tests can run')
  }
}

type Fixtures = {
  window: Page
}

export const test = base.extend<Fixtures>({
  window: async ({ page }, use) => {
    page.setDefaultTimeout(20_000)
    await page.addInitScript(() => {
      window.print = () => {}
    })
    await waitForLiveApp(page)
    await signIn(page)
    await use(page)
  },
})

export { expect } from '@playwright/test'
