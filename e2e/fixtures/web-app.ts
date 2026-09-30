import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { test as base, type Page } from '@playwright/test'
import { closeDatabase, initDatabase } from '../../server/db'
import { createApp } from '../../server/app'
import { clearAllSessionsForTests } from '../../server/auth/session'

type Fixtures = {
  window: Page
  userDataDir: string
}

export const test = base.extend<Fixtures>({
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'jtp-e2e-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },

  window: async ({ userDataDir, browser }, use) => {
    process.env.JEWELTRACKERPRO_E2E = '1'
    process.env.JEWELTRACKERPRO_E2E_USER_DATA = userDataDir
    clearAllSessionsForTests()
    closeDatabase()
    initDatabase()
    const app = createApp()
    const server = await new Promise<Server>((resolve) => {
      const started = app.listen(0, '127.0.0.1', () => resolve(started))
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 3000
    const origin = `http://127.0.0.1:${port}`
    const page = await browser.newPage()
    await page.addInitScript(() => {
      window.print = () => {}
    })
    const login = await page.request.post(`${origin}/api/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    })
    if (!login.ok()) {
      throw new Error(`E2E admin login failed: ${await login.text()}`)
    }
    await page.goto(`${origin}/dashboard`)
    await use(page)
    await page.close()
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    clearAllSessionsForTests()
    closeDatabase()
  },
})

export { expect } from '@playwright/test'
