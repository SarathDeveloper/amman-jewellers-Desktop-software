import { describe, expect, it } from 'vitest'
import type { BackupStatus } from '../../shared/types'
import {
  backupAttentionMessage,
  daysSinceBackup,
  healthTitle,
  healthTone,
  needsAttention,
} from '../../shared/backupHealth'

const now = new Date(2026, 9, 9, 18)

function status(overrides: Partial<BackupStatus> = {}): BackupStatus {
  return {
    lastBackupAt: now.toISOString(),
    frequency: 'daily',
    time: '21:00',
    nextBackupAt: null,
    offsiteDir: 'E:\\JewelTrackerPro',
    lastOffsiteAt: now.toISOString(),
    lastOffsiteError: null,
    ...overrides,
  }
}

describe('backup health', () => {
  it('does not ask for attention when a fresh copy exists on and off the machine', () => {
    expect(needsAttention(status(), now)).toBe(false)
    expect(healthTone(daysSinceBackup(now.toISOString(), now), true)).toBe('ok')
    expect(healthTitle(0, true)).toBe('Backed up today')
  })

  it('asks for attention when there is no backup or no off-machine folder', () => {
    expect(needsAttention(status({ lastBackupAt: null }), now)).toBe(true)
    expect(needsAttention(status({ offsiteDir: '' }), now)).toBe(true)
  })

  it('asks for attention when the last backup is two days old or older', () => {
    expect(needsAttention(status({ lastBackupAt: new Date(2026, 9, 8, 9).toISOString() }), now)).toBe(false)
    expect(needsAttention(status({ lastBackupAt: new Date(2026, 9, 7, 9).toISOString() }), now)).toBe(true)
  })

  it('asks for attention when the off-machine copy failed or is stale, but not before the first copy', () => {
    expect(needsAttention(status({ lastOffsiteError: 'Off-machine folder was not found' }), now)).toBe(true)
    expect(needsAttention(status({ lastOffsiteAt: null }), now)).toBe(false)
    expect(needsAttention(status({ lastOffsiteAt: new Date(2026, 9, 7, 9).toISOString() }), now)).toBe(true)
  })

  it('explains why attention is needed', () => {
    expect(backupAttentionMessage(status({ lastBackupAt: null }), now)).toBe(
      'No database backup has been taken yet.',
    )
    expect(backupAttentionMessage(status({ offsiteDir: '' }), now)).toContain('off-machine backup folder is set')
    expect(backupAttentionMessage(status({ lastOffsiteError: 'USB missing' }), now)).toContain('USB missing')
  })
})
