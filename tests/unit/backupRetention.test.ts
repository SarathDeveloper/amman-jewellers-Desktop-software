import { describe, expect, it } from 'vitest'
import { backupKindForName, selectBackupsToKeep } from '../../shared/backupRetention'

function dailyName(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `jeweltrackerpro-${year}-${month}-${day}.db`
}

function stamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}-${hour}${minute}${second}`
}

function clock(date: Date): string {
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${hour}${minute}${second}`
}

describe('backup kind detection', () => {
  it('recognises every kind this app writes', () => {
    expect(backupKindForName('jeweltrackerpro-2026-10-09.db')).toBe('daily')
    expect(backupKindForName('jeweltrackerpro-manual-20261009-120000.db')).toBe('manual')
    expect(backupKindForName('jeweltrackerpro-dayclose-2026-10-09-gold-180000.db')).toBe('dayclose')
    expect(backupKindForName('jeweltrackerpro-prerestore-20261009-120000.db')).toBe('prerestore')
    expect(backupKindForName('jeweltrackerpro-premigrate-v55-20261009-120000.db')).toBe('premigrate')
  })

  it('ignores names that are not backups, including half-written copies', () => {
    expect(backupKindForName('~$jeweltrackerpro-2026-10-09.db.tmp')).toBeNull()
    expect(backupKindForName('jeweltrackerpro-manual-20261009-120000.xlsx')).toBeNull()
    expect(backupKindForName('notes.txt')).toBeNull()
  })
})

describe('backup retention', () => {
  const now = new Date(2026, 9, 9, 12)

  it('keeps the newest daily copies plus weekly and monthly anchors', () => {
    const names: string[] = []
    for (let day = 0; day < 120; day += 1) {
      names.push(dailyName(new Date(2026, 9, 9 - day, 12)))
    }

    const keep = selectBackupsToKeep(names, now)
    expect(keep.has(dailyName(new Date(2026, 9, 9)))).toBe(true)
    expect(keep.has(names[names.length - 1]!)).toBe(false)

    const keptDaily = names.filter((name) => keep.has(name))
    expect(keptDaily.length).toBeGreaterThan(14)
    expect(keptDaily.length).toBeLessThan(names.length)
  })

  it('caps manual, day-close, pre-restore and pre-update copies', () => {
    const manual = Array.from(
      { length: 40 },
      (_, index) => `jeweltrackerpro-manual-${stamp(new Date(2026, 9, 9, 12, 0, 0 - index))}.db`,
    )
    const dayclose = Array.from(
      { length: 70 },
      (_, index) =>
        `jeweltrackerpro-dayclose-2026-10-09-gold-${clock(new Date(2026, 9, 9, 12, 0, 0 - index))}.db`,
    )
    const prerestore = Array.from(
      { length: 9 },
      (_, index) => `jeweltrackerpro-prerestore-${stamp(new Date(2026, 9, 9, 12, 0, 0 - index))}.db`,
    )
    const premigrate = Array.from(
      { length: 9 },
      (_, index) => `jeweltrackerpro-premigrate-v5${index}-${stamp(new Date(2026, 9, 9, 12, 0, 0 - index))}.db`,
    )

    expect(selectBackupsToKeep(manual, now).size).toBe(30)
    expect(selectBackupsToKeep(dayclose, now).size).toBe(60)
    expect(selectBackupsToKeep(prerestore, now).size).toBe(5)
    expect(selectBackupsToKeep(premigrate, now).size).toBe(5)
  })

  it('never selects a name it does not recognise', () => {
    const keep = selectBackupsToKeep(
      ['~$jeweltrackerpro-2026-10-09.db.tmp', 'notes.txt', 'jeweltrackerpro-2026-10-09.xlsx'],
      now,
    )
    expect(keep.size).toBe(0)
  })
})
