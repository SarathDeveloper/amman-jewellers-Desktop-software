import {
  goldPurityPercent,
  silverPurityPercent,
  type GoldKarat,
  type SilverFineness,
} from '@shared/billing/metalRateDerivation'
import type { MetalRates } from '@shared/types'

export type RateHistoryRow = {
  key: string
  snapshotId: number
  type: 'Gold' | 'Silver'
  purity: string
  rate: number
  updatedAt: string
}

const GOLD_ROWS: { karat: GoldKarat; field: keyof MetalRates }[] = [
  { karat: 24, field: 'gold24k' },
  { karat: 22, field: 'gold22k' },
  { karat: 20, field: 'gold20k' },
  { karat: 18, field: 'gold18k' },
]

const SILVER_ROWS: { fineness: SilverFineness; field: keyof MetalRates }[] = [
  { fineness: 999, field: 'silverFine' },
  { fineness: 925, field: 'silver925' },
]

function snapshotSortKey(row: MetalRates): string {
  return `${row.createdAt}\t${row.effectiveDate}`
}

export function flattenRateHistory(history: MetalRates[]): RateHistoryRow[] {
  return [...history]
    .sort((a, b) => snapshotSortKey(b).localeCompare(snapshotSortKey(a)))
    .flatMap((snapshot) => {
      const gold = GOLD_ROWS.map((row) => ({
        key: `${snapshot.id}-gold-${row.karat}`,
        snapshotId: snapshot.id,
        type: 'Gold' as const,
        purity: `${row.karat}K (${goldPurityPercent(row.karat)})`,
        rate: Number(snapshot[row.field] ?? 0),
        updatedAt: snapshot.createdAt,
      }))
      const silver = SILVER_ROWS.map((row) => ({
        key: `${snapshot.id}-silver-${row.fineness}`,
        snapshotId: snapshot.id,
        type: 'Silver' as const,
        purity: `${row.fineness} (${silverPurityPercent(row.fineness)})`,
        rate: Number(snapshot[row.field] ?? 0),
        updatedAt: snapshot.createdAt,
      }))
      return [...gold, ...silver]
    })
}
