import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
  },
})
