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
  await expect(window.locator('.cash-bill-party')).toContainText('Customer :')
  await expect(window.locator('.cash-bill-party')).toContainText('E2E Customer')
  await expect(window.locator('.cash-bill-party')).toContainText('Address :')
  await expect(window.locator('.cash-bill-party')).toContainText('Mobile :')
  await expect(window.locator('.cash-bill-party')).not.toContainText('Father/Husband')
  await expect(window.locator('.cash-bill-party')).not.toContainText('Thiru')

  await window.goto(`${origin}/print/tax-invoice/${invoiceId}`)
  await expect(window.getByRole('heading', { name: shopName })).toBeVisible({
    timeout: 15_000,
  })
  await expect(window.locator('.error-banner')).toHaveCount(0)
  await expect(window.getByRole('heading', { name: 'BILL TO' })).toBeVisible()
  await expect(window.locator('.tax-invoice-party')).toContainText('Customer :')
  await expect(window.locator('.tax-invoice-party')).toContainText('E2E Customer')
  await expect(window.locator('.tax-invoice-party')).not.toContainText('Father/Husband')
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

test('cash bill and tax invoice print as one A5 page', async ({ window }) => {
  const shopName = 'Print Shop'
  await seedShopName(window, shopName)
  const invoiceId = await seedFinalInvoice(window)
  const origin = new URL(window.url()).origin

  for (const path of [`/print/cash-bill/${invoiceId}`, `/print/tax-invoice/${invoiceId}`]) {
    await window.goto(`${origin}${path}`)
    await expect(window.getByRole('heading', { name: shopName })).toBeVisible({ timeout: 15_000 })
    await window.waitForFunction(
      () =>
        (window as unknown as { __PRINT_SIGNAL__?: { type?: string } }).__PRINT_SIGNAL__?.type ===
        'print-ready',
    )
    await expect(window.locator('[data-print-root]')).toHaveClass(/paper-a5/)

    const pdf = await window.pdf({ preferCSSPageSize: true, printBackground: true })
    const text = pdf.toString('latin1')
    const pageCount = text.match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0
    expect(pageCount).toBe(1)

    const box = text.match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/)
    expect(box).not.toBeNull()
    const width = Number(box?.[1])
    const height = Number(box?.[2])
    // A5 portrait is 148mm × 210mm (about 420 × 595 pt).
    expect(width).toBeGreaterThan(400)
    expect(width).toBeLessThan(440)
    expect(height).toBeGreaterThan(570)
    expect(height).toBeLessThan(620)
  }
})
