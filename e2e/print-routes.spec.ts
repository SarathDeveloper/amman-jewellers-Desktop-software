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

test('a print route loads the print document, not the application', async ({ window }) => {
  const shopName = 'Print Shop'
  await seedShopName(window, shopName)
  const invoiceId = await seedFinalInvoice(window)
  const origin = new URL(window.url()).origin

  // Record only what the print document asks for. The dashboard load above is
  // deliberately excluded.
  const requested: string[] = []
  window.on('request', (request) => requested.push(new URL(request.url()).pathname))

  await window.goto(`${origin}/print/cash-bill/${invoiceId}`)
  await expect(window.getByRole('heading', { name: shopName })).toBeVisible({ timeout: 15_000 })

  // The document that was served is print.html, so its entry is the print chunk.
  const entry = await window.evaluate(
    () => document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? '',
  )
  expect(entry).toMatch(/^\/assets\/print-.*\.js$/)

  // The whole point of the print entry: the frame must not download or parse the
  // application bundle, which used to be the dominant cost of opening a preview.
  expect(requested.some((path) => /^\/assets\/main-.*\.js$/.test(path))).toBe(false)
  expect(requested.some((path) => /^\/assets\/print-.*\.js$/.test(path))).toBe(true)

  // And it must not run the auth provider, which the application shell mounts.
  expect(requested).not.toContain('/api/auth/me')
})
