import type { ShopSettings } from '@shared/types'

export type SampleBillKind = 'cash' | 'tax' | 'adagu'

const SAMPLE_PRINT_STORAGE_KEY = 'jas-sample-bill-print'

export function storeSampleBillPrint(kind: SampleBillKind, shop: ShopSettings): void {
  localStorage.setItem(SAMPLE_PRINT_STORAGE_KEY, JSON.stringify({ kind, shop }))
}

export function takeSampleBillPrint(kind: SampleBillKind): ShopSettings | null {
  try {
    const raw = localStorage.getItem(SAMPLE_PRINT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { kind?: string; shop?: ShopSettings }
    localStorage.removeItem(SAMPLE_PRINT_STORAGE_KEY)
    if (parsed.kind === kind && parsed.shop) return parsed.shop
    return null
  } catch {
    localStorage.removeItem(SAMPLE_PRINT_STORAGE_KEY)
    return null
  }
}
