import { expect, test } from './fixtures/web-app'
import { expectPrintPreviewModal, openInventoryTab } from './helpers/nav'

test('inward finalize increases product piece stock', async ({ window }) => {
  const productName = `Inward Chain ${Date.now()}`

  await window.evaluate(async (name) => {
    async function api<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      })
      if (!response.ok) throw new Error(await response.text())
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }
    await api('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Inward Supplier', phone: '', address: '', notes: '' }),
    })
    await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name,
        category: 'Chain',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 10,
        netWeight: 8,
        makingCharges: 0,
        stockQty: 1,
        imagePath: '',
        huids: ['IW0001'],
      }),
    })
  }, productName)

  await openInventoryTab(window, 'Purchase')
  await expect(window.getByRole('heading', { name: 'Purchase', exact: true })).toBeVisible()
  await window.getByRole('button', { name: 'New purchase' }).click()

  const dialog = window.getByRole('dialog', { name: 'New purchase' })
  await dialog.getByLabel('Supplier').selectOption({ label: 'Inward Supplier' })
  await dialog.getByLabel('Product').selectOption({ label: productName })
  await dialog.getByLabel('Qty').fill('2')
  await dialog.getByLabel('HUID 1').fill('IW0002')
  await dialog.getByLabel('HUID 2').fill('IW0003')
  await dialog.getByLabel('Net weight').fill('8')
  await dialog.getByLabel('Rate').fill('100')
  await dialog.getByRole('button', { name: 'Save & finalize' }).click()

  const confirm = window.getByRole('dialog', { name: 'Finalize purchase?' })
  await confirm.getByRole('button', { name: 'Finalize' }).click()
  await expect(window.getByText('Purchase finalized — stock updated')).toBeVisible()

  await window.getByRole('button', { name: /^Print / }).first().click()
  const preview = await expectPrintPreviewModal(window)
  await preview.getByRole('button', { name: 'Close' }).click()
  await expect(preview).toBeHidden()

  await openInventoryTab(window, 'Products')
  const row = window.getByRole('row').filter({ hasText: productName })
  await expect(row.locator('.stock-qty')).toHaveText('3')
})
