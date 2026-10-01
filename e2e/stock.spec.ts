import { expect, test } from './fixtures/web-app'
import { localTodayIso } from './helpers/dates'
import { expectPrintPreviewModal, openInventoryTab } from './helpers/nav'

test('stock opening and auto sales from finalized invoice', async ({ window }) => {
  const today = localTodayIso()

  await window.evaluate(async (date) => {
    async function api<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      })
      if (!response.ok) throw new Error(await response.text())
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }
    const customer = await api<{ id: number }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Stock E2E', phone: '9999999999', address: 'Salem', notes: '' }),
    })
    const product = await api<{ id: number }>('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Stock Chain',
        category: 'Chain',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 10,
        netWeight: 4,
        makingCharges: 0,
        stockQty: 5,
        imagePath: '',
        huids: ['ST0001', 'ST0002', 'ST0003', 'ST0004', 'ST0005'],
      }),
    })
    const invoice = await api<{ id: number }>('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        invoiceDate: date,
        tax: 0,
        items: [{ productId: product.id, qty: 1, rate: 500 }],
      }),
    })
    await api(`/api/invoices/${invoice.id}/finalize`, { method: 'POST' })
  }, today)

  await openInventoryTab(window, 'Gold & Silver')
  await expect(window.getByRole('heading', { name: 'Gold & Silver Stock' })).toBeVisible()
  await window.locator('input[type="date"]').fill(today)

  const chainRow = window.locator('tbody tr').filter({
    has: window.getByRole('cell', { name: 'Chain', exact: true }),
  })
  await chainRow.getByRole('button', { name: 'Edit Chain' }).click()
  await window.getByLabel('Opening Weight (g)').fill('50')
  await window.getByRole('button', { name: 'Update Category' }).click()

  await expect(chainRow).toContainText('46')
})

test('two-step delete requires a matching category name', async ({ window }) => {
  const today = localTodayIso()
  const categoryName = `TempCat-${Date.now()}`

  await window.evaluate(
    async ({ date, name }) => {
      const response = await fetch('/api/stock/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          stockDate: date,
          metal: 'Gold',
          openingWeight: 5,
        }),
      })
      if (!response.ok) throw new Error(await response.text())
    },
    { date: today, name: categoryName },
  )

  await openInventoryTab(window, 'Gold & Silver')
  await window.locator('input[type="date"]').fill(today)

  const row = window.locator('tbody tr').filter({
    has: window.getByRole('cell', { name: categoryName, exact: true }),
  })
  await row.getByRole('button', { name: `Delete ${categoryName}` }).click()

  await expect(window.getByRole('heading', { name: 'Delete category?' })).toBeVisible()
  await window.getByRole('button', { name: 'Continue' }).click()
  await expect(window.getByRole('heading', { name: 'Confirm deletion' })).toBeVisible()

  await window.getByLabel('Type category name to confirm').fill('wrong-name')
  await expect(window.getByRole('button', { name: 'Delete permanently' })).toBeDisabled()

  await window.getByLabel('Type category name to confirm').fill(categoryName)
  await window.getByRole('button', { name: 'Delete permanently' }).click()

  await expect(row).toHaveCount(0)
})

test('closing summary hides quiet categories in transacted mode', async ({ window }) => {
  const today = localTodayIso()
  const quietName = `QuietCat-${Date.now()}`
  const movedName = `MovedCat-${Date.now()}`

  await window.evaluate(
    async ({ date, quietName, movedName }) => {
      async function api<T>(path: string, init?: RequestInit): Promise<T> {
        const response = await fetch(path, {
          ...init,
          headers: { 'Content-Type': 'application/json', ...init?.headers },
        })
        if (!response.ok) throw new Error(await response.text())
        if (response.status === 204) return undefined as T
        return (await response.json()) as T
      }

      async function createCategory(name: string, openingWeight: number) {
        const response = await fetch('/api/stock/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            stockDate: date,
            metal: 'Gold',
            openingWeight,
          }),
        })
        if (!response.ok) throw new Error(await response.text())
      }

      await createCategory(quietName, 5)
      await createCategory(movedName, 20)

      const customer = await api<{ id: number }>('/api/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Closing Summary E2E',
          phone: '8888888888',
          address: 'Salem',
          notes: '',
        }),
      })
      const product = await api<{ id: number }>('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: `${movedName} Ring`,
          category: movedName,
          metal: 'Gold',
          purity: '22K',
          grossWeight: 10,
          netWeight: 4,
          makingCharges: 0,
          stockQty: 5,
          imagePath: '',
          huids: ['ST1001', 'ST1002', 'ST1003', 'ST1004', 'ST1005'],
        }),
      })
      const invoice = await api<{ id: number }>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          invoiceDate: date,
          tax: 0,
          items: [{ productId: product.id, qty: 1, rate: 500 }],
        }),
      })
      await api(`/api/invoices/${invoice.id}/finalize`, { method: 'POST' })
    },
    { date: today, quietName, movedName },
  )

  await openInventoryTab(window, 'Gold & Silver')
  await window.locator('input[type="date"]').fill(today)
  await window.getByRole('tab', { name: 'Closing Summary' }).click()

  const goldSection = window.locator('section.stock-closing-metal').filter({
    has: window.getByRole('heading', { name: 'Gold' }),
  })
  await expect(goldSection).toBeVisible()
  await expect(goldSection.getByRole('cell', { name: movedName, exact: true })).toBeVisible()
  await expect(goldSection.getByRole('cell', { name: quietName, exact: true })).toHaveCount(0)

  await window.getByRole('button', { name: 'All' }).click()
  await expect(goldSection.getByRole('cell', { name: movedName, exact: true })).toBeVisible()
  await expect(goldSection.getByRole('cell', { name: quietName, exact: true })).toBeVisible()
})

test('stock print opens a modal instead of navigating', async ({ window }) => {
  await openInventoryTab(window, 'Gold & Silver')
  await window.getByRole('button', { name: 'Print', exact: true }).click()
  const dialog = await expectPrintPreviewModal(window)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
})
