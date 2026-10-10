import type { Page } from '@playwright/test'
import { getDatabase } from '../../server/db'
import { seedSampleGoldSavingsIfEmpty } from '../../server/db/sampleGoldSavings'
import { localTodayIso } from './dates'

export function seedGoldSavingsDemo(): boolean {
  return seedSampleGoldSavingsIfEmpty(getDatabase())
}

async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export async function seedFinalInvoice(page: Page): Promise<number> {
  const invoiceDate = localTodayIso()
  return page.evaluate(async (date) => {
    async function api<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }

    const customer = await api<{ id: number }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E Customer',
        phone: '9000000000',
        address: 'Test',
        notes: '',
      }),
    })
    const product = await api<{ id: number }>('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E Chain',
        category: 'Chain',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 10,
        netWeight: 2.5,
        makingCharges: 0,
        stockQty: 5,
        imagePath: '',
        huids: ['E00001', 'E00002', 'E00003', 'E00004', 'E00005'],
      }),
    })
    const invoice = await api<{ id: number }>('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        invoiceDate: date,
        tax: 0,
        autoTax: false,
        paymentMode: 'upi',
        items: [
          {
            productId: product.id,
            qty: 1,
            rate: 1000,
            metalRate: 1000,
            netWeight: 2.5,
            huid: 'E00001',
          },
        ],
      }),
    })
    const finalized = await api<{ id: number }>(`/api/invoices/${invoice.id}/finalize`, { method: 'POST' })
    return finalized.id
  }, invoiceDate)
}

/** Create a single-piece product tagged with one known HUID, for scan-to-bill tests. */
export async function seedTaggedProduct(
  page: Page,
  values: { name: string; huid: string },
): Promise<number> {
  return page.evaluate(async ({ name, huid }) => {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category: 'Ring',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 3,
        netWeight: 2.5,
        makingCharges: 0,
        stockQty: 1,
        imagePath: '',
        huids: [huid],
      }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const product = (await response.json()) as { id: number }
    return product.id
  }, values)
}

export async function seedShopName(page: Page, shopName: string): Promise<void> {
  await page.evaluate(async (name) => {
    async function api<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    }

    const settings = await api<Record<string, unknown>>('/api/settings')
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ ...settings, shopName: name }),
    })
  }, shopName)
}

export { apiCall }
