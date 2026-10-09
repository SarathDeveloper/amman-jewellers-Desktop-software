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

test('products shortcut opens the purchase editor and saves a draft before HUIDs are known', async ({ window }) => {
  const goldName = `Draft Stud ${Date.now()}`
  const silverName = `Silver Anklet ${Date.now()}`

  await window.evaluate(
    async ({ goldName, silverName }) => {
      async function api(path: string, body: unknown) {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok) throw new Error(await response.text())
      }
      await api('/api/suppliers', { name: 'Draft Supplier', phone: '', address: '', notes: '' })
      const base = { grossWeight: 2, netWeight: 2, makingCharges: 0, stockQty: 0, imagePath: '', huids: [] }
      await api('/api/products', { ...base, name: goldName, category: 'Stud', metal: 'Gold', purity: '22K' })
      await api('/api/products', { ...base, name: silverName, category: 'Chain', metal: 'Silver', purity: '925' })
    },
    { goldName, silverName },
  )

  await openInventoryTab(window, 'Products')
  await window.getByRole('checkbox', { name: `Select ${goldName}` }).first().check()
  await window.getByRole('checkbox', { name: `Select ${silverName}` }).first().check()
  await window.getByRole('button', { name: 'Add inward to selected' }).click()

  const dialog = window.getByRole('dialog', { name: 'New purchase' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.inward-line-card')).toHaveCount(2)
  await expect(dialog.getByText('optional for silver')).toBeVisible()
  await dialog.getByLabel('Rate').first().fill('100')
  await dialog.getByRole('button', { name: 'Save draft' }).click()
  await expect(window.getByText('Draft saved')).toBeVisible()

  await openInventoryTab(window, 'Purchase')
  const draftRow = window.getByRole('row').filter({ hasText: 'Draft Supplier' })
  await expect(draftRow.getByText('Draft', { exact: true })).toBeVisible()
  await draftRow.getByRole('button', { name: 'Finalize' }).click()
  await window.getByRole('dialog', { name: 'Finalize purchase?' }).getByRole('button', { name: 'Finalize' }).click()
  await expect(window.getByText(`${goldName}: Add 1 HUID for the new piece`)).toBeVisible()
})
