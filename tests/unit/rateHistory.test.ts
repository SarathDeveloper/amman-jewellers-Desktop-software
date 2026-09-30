import { describe, expect, it } from 'vitest'
import { flattenRateHistory } from '../../src/features/rates/rateHistory'
import type { MetalRates } from '@shared/types'

function snapshot(overrides: Partial<MetalRates> & Pick<MetalRates, 'id' | 'createdAt'>): MetalRates {
  return {
    effectiveDate: '2026-09-27',
    gold24k: 16000,
    gold22k: 14666.67,
    gold20k: 13333.33,
    gold18k: 12000,
    silverFine: 240,
    silver925: 222.22,
    ...overrides,
  }
}

describe('flattenRateHistory', () => {
  it('expands snapshots into newest-first purity rows in card order', () => {
    const latest = snapshot({
      id: 2,
      effectiveDate: '2026-09-28',
      createdAt: '2026-09-28 04:36:49',
      gold24k: 16500,
      gold22k: 15125,
      gold20k: 13750,
      gold18k: 12375,
      silverFine: 250,
      silver925: 231.48,
    })
    const earlier = snapshot({
      id: 1,
      createdAt: '2026-09-27 10:00:00',
    })

    const rows = flattenRateHistory([earlier, latest])
    expect(rows).toHaveLength(12)
    expect(rows.slice(0, 6).map((row) => `${row.type} ${row.purity}`)).toEqual([
      'Gold 24K (100%)',
      'Gold 22K (91.7%)',
      'Gold 20K (83.3%)',
      'Gold 18K (75%)',
      'Silver 999 (99.9%)',
      'Silver 925 (92.5%)',
    ])
    expect(rows[0].rate).toBe(16500)
    expect(rows[5].rate).toBe(231.48)
    expect(rows[0].updatedAt).toBe('2026-09-28 04:36:49')
    expect(rows[6].snapshotId).toBe(1)
    expect(rows[6].rate).toBe(16000)
  })
})
