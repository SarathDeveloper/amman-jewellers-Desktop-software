import { expect, test } from './fixtures/web-app'
import { expectPrintPreviewModal, sidebarLink } from './helpers/nav'

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('settings shows version and database path', async ({ window }) => {
  await sidebarLink(window, 'Settings').click()
  await expect(window.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(window.getByText('Database Location')).toBeVisible()
  await expect(window.locator('.settings-header-chip').getByText(/v\d+\.\d+\.\d+/)).toBeVisible()
  await expect(window.getByText(/jeweltrackerpro\.db/)).toBeVisible()
})

test('shop details form saves shop name and tagline', async ({ window }) => {
  await sidebarLink(window, 'Settings').click()
  await expect(window.getByRole('heading', { name: 'Shop Identity' })).toBeVisible()
  await expect(window.locator('.settings-image-preview img')).toBeVisible()
  await window.getByRole('textbox', { name: /Shop Name/ }).fill('JewelTrackerPro')
  await window.getByRole('textbox', { name: /App subtitle/ }).fill('Gold and silver')
  await window.getByRole('textbox', { name: /Phone 1/ }).fill('9000000000')
  await window.getByRole('textbox', { name: /Address Line 1/ }).fill('1 Market Street')
  await window.getByRole('textbox', { name: /City/ }).fill('Salem')

  await window.getByRole('button', { name: 'Save Changes' }).first().click()
  await expect(window.getByText('Shop details saved')).toBeVisible()
  await expect(window.locator('.brand-text')).toContainText('JewelTrackerPro')
  await expect(window.locator('.brand-text')).toContainText('Gold and silver')
})

test('shop logo uploads and persists after save', async ({ window }) => {
  await sidebarLink(window, 'Settings').click()
  await expect(window.getByRole('heading', { name: 'Shop Identity' })).toBeVisible()

  await window.getByRole('textbox', { name: /Shop Name/ }).fill('Logo Shop')
  await window.getByRole('textbox', { name: /Phone 1/ }).fill('9000000000')
  await window.getByRole('textbox', { name: /Address Line 1/ }).fill('1 Market Street')
  await window.getByRole('textbox', { name: /City/ }).fill('Salem')

  const logoField = window.locator('.settings-identity-field').filter({ hasText: 'Business Logo' })
  await logoField.getByLabel('Upload Shop Logo', { exact: true }).setInputFiles({
    name: 'shop-logo.png',
    mimeType: 'image/png',
    buffer: PNG_1x1,
  })
  await expect(window.getByText('Image saved')).toBeVisible()
  await expect(logoField.locator('.settings-image-preview img')).toHaveAttribute(
    'src',
    /\/uploads\/.+\.png/,
  )

  await sidebarLink(window, 'Dashboard').click()
  await sidebarLink(window, 'Settings').click()
  await expect(window.getByRole('heading', { name: 'Shop Identity' })).toBeVisible()
  await expect(window.getByRole('textbox', { name: /Shop Name/ })).toHaveValue('Logo Shop')
  await expect(
    window
      .locator('.settings-identity-field')
      .filter({ hasText: 'Business Logo' })
      .locator('.settings-image-preview img'),
  ).toHaveAttribute('src', /\/uploads\/.+\.png/)
})

test('invoice settings preview opens from Test Print', async ({ window }) => {
  await sidebarLink(window, 'Settings').click()
  await expect(window.getByRole('heading', { name: 'Shop Identity' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Invoice Settings' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Bill template' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Test Print' })).toBeVisible()
  await expect(window.locator('.settings-bill-preview-placeholder')).toContainText('Cash bill')
  await expect(window.locator('.settings-bill-preview-frame')).toHaveCount(0)
  await window.getByRole('button', { name: 'Test Print' }).click()
  const previewDialog = await expectPrintPreviewModal(window)
  await previewDialog.getByRole('button', { name: 'Close' }).click()
  await expect(previewDialog).toBeHidden()
  await expect(window.getByRole('heading', { name: 'GST tax summary' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Detailed' })).toHaveCount(0)
  await expect(window.getByRole('textbox', { name: 'Customer prefix' })).toHaveCount(0)

  await window.getByRole('textbox', { name: /Shop Name/ }).fill('Invoice Shop')
  await window.getByRole('textbox', { name: /Phone 1/ }).fill('9000000000')
  await window.getByRole('textbox', { name: /Address Line 1/ }).fill('1 Market Street')
  await window.getByRole('textbox', { name: /City/ }).fill('Salem')

  const invoiceTabs = window.locator('.billing-chrome-tabs')
  await invoiceTabs.getByRole('button', { name: 'Tax Invoice' }).click()
  await expect(window.locator('.settings-bill-preview-placeholder')).toContainText('Tax invoice')

  await invoiceTabs.getByRole('button', { name: 'Adagu Bill' }).click()
  await expect(window.locator('.settings-bill-preview-placeholder')).toContainText('Adagu bill')
  await expect(window.getByText('Adagu POS Settings')).toBeVisible()

  await invoiceTabs.getByRole('button', { name: 'Cash Bill' }).click()
  await expect(window.locator('.settings-bill-preview-placeholder')).toContainText('Cash bill')

  await window
    .locator('.card')
    .filter({ has: window.getByRole('heading', { name: 'Invoice Settings' }) })
    .getByRole('button', { name: 'Save Changes' })
    .click()
  await expect(window.getByText('Invoice settings saved')).toBeVisible()
})

test('printers backup and data settings are available', async ({ window }) => {
  await sidebarLink(window, 'Settings').click()

  await window.getByRole('tab', { name: 'Printers' }).click()
  await expect(window.getByRole('heading', { name: 'Printers' })).toBeVisible()
  await expect(window.getByText('Bills print from the browser')).toBeVisible()
  await expect(window.getByLabel('Cash bill paper size')).toContainText('A5')
  await expect(window.getByLabel('Tax invoice paper size')).toContainText('A4')
  await expect(window.getByLabel('Cash bill copies')).toContainText('1')
  await expect(window.getByLabel('Tax invoice copies')).toContainText('1')

  await window.getByRole('tab', { name: 'Backup' }).click()
  await expect(window.getByRole('heading', { name: 'Database Backup' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Back Up Now' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Export Copy' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Export Excel' })).toBeVisible()
  await expect(window.getByText('Restore from File')).toBeVisible()
  await expect(window.getByText(/Backed up today|No backup yet|Last backup/)).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Saved backups' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Automatic backup' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Off-machine copy' })).toBeVisible()
  await expect(window.getByLabel('Off-machine folder')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Copy now' })).toBeVisible()
  await expect(window.getByLabel('Backup frequency')).toHaveValue('daily')
  await expect(window.getByLabel('Backup time')).toBeVisible()
  await expect(window.getByText('9:00 PM', { exact: true })).toBeVisible()

  await window.getByRole('tab', { name: 'Data', exact: true }).click()
  await expect(window.getByRole('heading', { name: 'Data' })).toBeVisible()
  await expect(window.getByText('App version')).toBeVisible()
  await expect(window.getByText('Log folder')).toBeVisible()
  await expect(window.getByText(/products, .*customers/)).toBeVisible()
})
