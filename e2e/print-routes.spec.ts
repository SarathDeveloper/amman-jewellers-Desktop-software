import { expect, test } from './fixtures/web-app'
import { seedFinalInvoice, seedShopName } from './helpers/seed'

test('cash bill and tax invoice print routes render shop header', async ({ window }) => {
  const shopName = 'Print Shop'
  await seedShopName(window, shopName)
  const invoiceId = await seedFinalInvoice(window)

  const origin = new URL(window.url()).origin
  await window.goto(`${origin}/print/cash-bill/${invoiceId}`)
  await expect(window.getByRole('heading', { name: shopName })).toBeVisible({
    timeout: 15_000,
  })
  await expect(window.locator('.error-banner')).toHaveCount(0)

  await window.goto(`${origin}/print/tax-invoice/${invoiceId}`)
  await expect(window.getByRole('heading', { name: shopName })).toBeVisible({
    timeout: 15_000,
  })
  await expect(window.locator('.error-banner')).toHaveCount(0)
})
