import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSameOrInside, offsiteDirError } from '../../server/db/offsitePath'

describe('offsite path', () => {
  const dataDir = resolve(join(tmpdir(), 'jtp-app-data'))

  it('allows an empty folder (feature off)', () => {
    expect(offsiteDirError('', [dataDir])).toBeNull()
    expect(offsiteDirError('   ', [dataDir])).toBeNull()
  })

  it('rejects a relative path', () => {
    expect(offsiteDirError('backups', [dataDir])).toBe('Choose an absolute folder path')
  })

  it('rejects a folder inside app data', () => {
    expect(offsiteDirError(dataDir, [dataDir])).toBe("Choose a folder outside this computer's app data")
    expect(offsiteDirError(join(dataDir, 'backups'), [dataDir])).toBe(
      "Choose a folder outside this computer's app data",
    )
  })

  it('allows a folder on another path', () => {
    const usb = resolve(join(tmpdir(), 'jtp-usb'))
    expect(isSameOrInside(usb, dataDir)).toBe(false)
    expect(offsiteDirError(usb, [dataDir])).toBeNull()
  })
})
