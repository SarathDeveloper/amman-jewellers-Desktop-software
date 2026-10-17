import { expect, test } from './fixtures/web-app'
import { expectPrintPreviewModal, openInventoryTab, sidebarLink } from './helpers/nav'

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
  await dialog.getByLabel('Supplier', { exact: true }).selectOption({ label: 'Inward Supplier' })
  await dialog.getByPlaceholder(/Search product/).fill(productName)
  await dialog.getByPlaceholder(/Search product/).press('Enter')
  await expect(dialog.getByPlaceholder(new RegExp(productName))).toBeVisible()
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

test('products shortcut opens the purchase editor and finalizes a draft without HUIDs', async ({ window }) => {
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
  await expect(dialog.getByText(/HUID \(Hallmark Unique ID\)/).first()).toBeVisible()
  await expect(dialog.getByText('optional').first()).toBeVisible()
  await dialog.getByLabel('Rate').first().fill('100')
  await dialog.getByRole('button', { name: 'Save draft' }).click()
  await expect(window.getByText('Draft saved')).toBeVisible()

  await openInventoryTab(window, 'Purchase')
  const draftRow = window.getByRole('row').filter({ hasText: 'Draft Supplier' })
  await expect(draftRow.getByText('Draft', { exact: true })).toBeVisible()
  await draftRow.getByRole('button', { name: 'Finalize' }).click()
  await window.getByRole('dialog', { name: 'Finalize purchase?' }).getByRole('button', { name: 'Finalize' }).click()
  await expect(window.getByText('Purchase finalized — stock updated')).toBeVisible()
})

test('a purchase creates a tracked product once, cancels, copies, and sells a piece by tag', async ({
  window,
}) => {
  const stamp = Date.now()
  const productName = `Tracked Ring ${stamp}`
  const supplierName = `Tracked Supplier ${stamp}`
  const customerName = `Piece Buyer ${stamp}`

  await window.evaluate(
    async ({ supplierName, customerName, phone }) => {
      async function api<T>(path: string, body: unknown): Promise<T> {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok) throw new Error(await response.text())
        return (await response.json()) as T
      }
      await api('/api/suppliers', {
        name: supplierName,
        phone: '',
        address: '',
        notes: '',
      })
      await api('/api/customers', {
        name: customerName,
        phone,
        address: 'Salem',
        notes: '',
      })
    },
    { supplierName, customerName, phone: `9${String(stamp).slice(-9)}` },
  )

  await openInventoryTab(window, 'Purchase')
  await window.getByRole('button', { name: 'New purchase' }).click()

  const dialog = window.getByRole('dialog', { name: 'New purchase' })
  await dialog.getByLabel('Supplier', { exact: true }).selectOption({ label: supplierName })
  await dialog.getByRole('button', { name: 'Add new product' }).click()

  const productDialog = window.getByRole('dialog', { name: 'Add product' })
  await productDialog.getByLabel('Product name').fill(productName)
  await productDialog.getByLabel('Category').selectOption('Ring')
  await productDialog.getByLabel('Metal').selectOption('Gold')
  await productDialog.getByLabel('Purity').selectOption('22K')
  await productDialog.getByLabel('Gross weight').fill('8.2')
  await productDialog.getByLabel('Net weight').fill('8')
  await productDialog.getByRole('button', { name: 'Save product' }).click()
  await expect(productDialog).toBeHidden()

  await dialog.getByLabel('Piece 1 HUID').fill(`TP${String(stamp).slice(-6)}A`)
  await dialog.getByRole('button', { name: 'Add piece' }).click()
  await dialog.getByLabel('Piece 2 HUID').fill(`TP${String(stamp).slice(-6)}B`)
  await dialog.getByLabel('Piece 2 gross weight').fill('8.2')
  await dialog.getByLabel('Piece 2 net weight').fill('8')
  await dialog.getByLabel('Rate').fill('100')

  await dialog.getByRole('button', { name: 'Save & finalize' }).click()
  const review = window.getByRole('dialog', { name: 'Finalize purchase?' })
  await expect(review).toContainText('+2 pcs')
  await review.getByRole('button', { name: 'Finalize' }).click()
  await expect(window.getByText('Purchase finalized — stock updated')).toBeVisible()

  await openInventoryTab(window, 'Products')
  const productRow = window.getByRole('row').filter({ hasText: productName })
  await expect(productRow.locator('.stock-qty')).toHaveText('2')

  await openInventoryTab(window, 'Purchase')
  const purchaseRow = window.getByRole('row').filter({ hasText: supplierName }).first()
  await purchaseRow.getByRole('button', { name: 'Cancel', exact: true }).click()

  const cancelDialog = window.getByRole('dialog', { name: 'Cancel purchase?' })
  await cancelDialog.getByLabel('Reason (required)').fill('Supplier invoice entered twice')
  await cancelDialog.getByRole('button', { name: 'Cancel purchase' }).click()
  await expect(window.getByText('Purchase cancelled — stock reversed')).toBeVisible()
  await expect(purchaseRow.getByText('Cancelled', { exact: true })).toBeVisible()

  await openInventoryTab(window, 'Products')
  await expect(productRow.locator('.stock-qty')).toHaveText('0')

  await openInventoryTab(window, 'Purchase')
  await purchaseRow.getByRole('button', { name: 'Copy to draft' }).click()
  const copyDialog = window.getByRole('dialog', { name: /^Edit IN-/ })
  await expect(copyDialog.locator('.inward-line-card')).toHaveCount(1)
  await copyDialog.getByRole('button', { name: 'Save & finalize' }).click()
  await review.getByRole('button', { name: 'Finalize' }).click()
  await expect(window.getByText('Purchase finalized — stock updated')).toBeVisible()

  await openInventoryTab(window, 'Products')
  await expect(productRow.locator('.stock-qty')).toHaveText('2')

  const tag = await window.evaluate(async (name) => {
    const products = (await fetch('/api/products').then((response) => response.json())) as Array<{
      id: number
      name: string
    }>
    const product = products.find((row) => row.name === name)
    if (!product) throw new Error(`Product ${name} not found`)
    const pieces = (await fetch(`/api/products/${product.id}/pieces?status=in_stock`).then(
      (response) => response.json(),
    )) as Array<{ tagCode: string }>
    return pieces[0].tagCode
  }, productName)

  await sidebarLink(window, 'Billing').click()
  await window.getByRole('tab', { name: /Quotation/ }).click()
  await window.getByPlaceholder('Search customer by name, phone or ID…').fill(customerName)
  await window.getByRole('option', { name: new RegExp(customerName) }).click()

  await window
    .getByPlaceholder('Search product by name, metal, category, SKU…')
    .fill(tag)
  await window.getByPlaceholder('Search product by name, metal, category, SKU…').press('Enter')

  const itemRow = window.locator('.sale-bill-items-table tbody tr').filter({
    has: window.locator(`.sale-bill-product-name[value*="${productName}"]`),
  })
  await expect(itemRow).toBeVisible()
  await expect(itemRow.locator('.sale-bill-piece-tag')).toHaveText(`Tag ${tag}`)
  await itemRow.getByLabel('Gold rate').fill('7000')

  await window.getByRole('button', { name: 'Save draft' }).first().click()
  await window.getByRole('button', { name: 'Finalize', exact: true }).click()
  await expect(window.getByRole('dialog', { name: 'Bill confirmed' })).toBeVisible()
  await window.locator('.modal-backdrop').click({ position: { x: 8, y: 8 } })

  await openInventoryTab(window, 'Products')
  await expect(productRow.locator('.stock-qty')).toHaveText('1')
})
