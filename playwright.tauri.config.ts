import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: [
    '**/inventory-billing-scenarios.spec.ts',
    '**/adagu-scenarios.spec.ts',
    '**/old-gold-scenarios.spec.ts',
  ],
  timeout: 180_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1400, height: 900 },
  },
})
