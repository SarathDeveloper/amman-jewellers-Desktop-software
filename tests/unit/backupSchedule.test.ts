import { describe, expect, it } from 'vitest'
import {
  isBackupDue,
  lastElapsedSlot,
  nextBackupAt,
  parseBackupTime,
  type BackupSchedule,
} from '../../shared/backupSchedule'

const daily: BackupSchedule = { frequency: 'daily', time: '21:00' }
const weekly: BackupSchedule = { frequency: 'weekly', time: '21:00' }

function local(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

function iso(date: Date): string {
  return date.toISOString()
}

describe('backup schedule', () => {
  it('falls back to 21:00 for invalid times', () => {
    expect(parseBackupTime('99:99')).toBe('21:00')
    expect(parseBackupTime('')).toBe('21:00')
    expect(parseBackupTime('21:00')).toBe('21:00')
  })

  it('treats a missing backup as due', () => {
    expect(isBackupDue(daily, null, local(2026, 9, 30, 10))).toBe(true)
    expect(nextBackupAt(daily, null, local(2026, 9, 30, 10))).toBeNull()
  })

  it('is not due before the daily time when yesterday was backed up', () => {
    const now = local(2026, 9, 30, 10, 0)
    const last = iso(local(2026, 9, 29, 21, 5))
    expect(lastElapsedSlot(daily, now)).toEqual(local(2026, 9, 29, 21, 0))
    expect(isBackupDue(daily, last, now)).toBe(false)
    expect(nextBackupAt(daily, last, now)).toEqual(local(2026, 9, 30, 21, 0))
  })

  it('is due after the daily time when yesterday was the last backup', () => {
    const now = local(2026, 9, 30, 21, 30)
    const last = iso(local(2026, 9, 29, 21, 5))
    expect(isBackupDue(daily, last, now)).toBe(true)
    expect(nextBackupAt(daily, last, now)).toBeNull()
  })

  it('skips the evening slot when a backup already ran today', () => {
    const now = local(2026, 9, 30, 21, 30)
    const last = iso(local(2026, 9, 30, 10, 0))
    expect(isBackupDue(daily, last, now)).toBe(false)
    expect(nextBackupAt(daily, last, now)).toEqual(local(2026, 10, 1, 21, 0))
  })

  it('catches up when a full daily slot was missed', () => {
    const now = local(2026, 9, 30, 10, 0)
    const last = iso(local(2026, 9, 28, 21, 0))
    expect(isBackupDue(daily, last, now)).toBe(true)
  })

  it('is not due weekly at 6 days', () => {
    const now = local(2026, 9, 30, 22, 0)
    const last = iso(local(2026, 9, 24, 21, 0))
    expect(isBackupDue(weekly, last, now)).toBe(false)
    expect(nextBackupAt(weekly, last, now)).toEqual(local(2026, 10, 1, 21, 0))
  })

  it('is not due weekly at 7 days before the scheduled time', () => {
    const now = local(2026, 9, 30, 10, 0)
    const last = iso(local(2026, 9, 23, 21, 0))
    expect(isBackupDue(weekly, last, now)).toBe(false)
    expect(nextBackupAt(weekly, last, now)).toEqual(local(2026, 9, 30, 21, 0))
  })

  it('is due weekly at 7 days after the scheduled time', () => {
    const now = local(2026, 9, 30, 21, 30)
    const last = iso(local(2026, 9, 23, 21, 0))
    expect(isBackupDue(weekly, last, now)).toBe(true)
  })

  it('is due weekly after 8 days even in the morning', () => {
    const now = local(2026, 9, 30, 10, 0)
    const last = iso(local(2026, 9, 22, 21, 0))
    expect(isBackupDue(weekly, last, now)).toBe(true)
  })
})
