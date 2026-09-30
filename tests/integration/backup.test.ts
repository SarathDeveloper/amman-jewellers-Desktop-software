import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { BackupFile, BackupStatus, Product } from '@shared/types'
import { assertSqliteIntegrity, ensureDailyBackup, ensureScheduledBackup, LAST_BACKUP_AT_KEY } from '../../server/db/backup'
import { getDatabase, getUserDataDir } from '../../server/db'
import { setShopSetting } from '../../server/lib/settingsStore'
import { localDateIso } from '../../shared/localDate'
import { getTestAgent, IPC_CHANNELS, ipc, useIntegrationEnv } from './helpers/testEnv'

const sampleProduct = {
  name: 'Test chain',
  category: 'Chain',
  metal: 'Gold',
  purity: '22K',
  grossWeight: 10,
  netWeight: 9.5,
  makingCharges: 100,
  stockQty: 5,
  imagePath: '',
}

describe('database backup and restore', () => {
  useIntegrationEnv()

  it('exports a consistent SQLite snapshot that passes integrity_check', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const destination = join(process.env.JEWELTRACKERPRO_E2E_USER_DATA as string, 'export.db')
    const status = await ipc<BackupStatus>(IPC_CHANNELS.APP_EXPORT_DB, { destinationPath: destination })

    expect(status.lastBackupAt).toBeTruthy()
    expect(existsSync(destination)).toBe(true)
    assertSqliteIntegrity(destination)

    const snapshot = new Database(destination, { readonly: true, fileMustExist: true })
    try {
      const row = snapshot.prepare('SELECT name FROM products WHERE name = ?').get('Test chain') as {
        name: string
      }
      expect(row.name).toBe('Test chain')
    } finally {
      snapshot.close()
    }

    const persisted = await ipc<BackupStatus>(IPC_CHANNELS.APP_BACKUP_STATUS)
    expect(persisted.lastBackupAt).toBe(status.lastBackupAt)
  })

  it('restores a backup and replaces current records', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const destination = join(process.env.JEWELTRACKERPRO_E2E_USER_DATA as string, 'restore-source.db')
    await ipc(IPC_CHANNELS.APP_EXPORT_DB, { destinationPath: destination })

    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, { ...sampleProduct, name: 'Later ring' })
    expect(await ipc<Product[]>(IPC_CHANNELS.PRODUCTS_LIST)).toHaveLength(2)

    await ipc(IPC_CHANNELS.APP_RESTORE_DB, { sourcePath: destination })
    const products = await ipc<Product[]>(IPC_CHANNELS.PRODUCTS_LIST)
    expect(products).toHaveLength(1)
    expect(products[0]?.name).toBe('Test chain')
  })

  it('writes a daily backup on demand', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    await ensureDailyBackup()
    const today = localDateIso()
    const dailyPath = join(getUserDataDir(), 'backups', `jeweltrackerpro-${today}.db`)
    expect(existsSync(dailyPath)).toBe(true)
    assertSqliteIntegrity(dailyPath)
  })

  it('creates a manual backup that can be listed, restored, and deleted', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()

    const created = await agent.post('/api/backup/create')
    expect(created.status).toBe(200)
    const backup = created.body as BackupFile
    expect(backup.kind).toBe('manual')
    expect(backup.name).toMatch(/^jeweltrackerpro-manual-\d{8}-\d{6}\.db$/)
    expect(backup.sizeBytes).toBeGreaterThan(0)
    assertSqliteIntegrity(join(getUserDataDir(), 'backups', backup.name))

    const listed = await agent.get('/api/backup/list')
    expect(listed.status).toBe(200)
    expect((listed.body as BackupFile[]).some((file) => file.name === backup.name && file.kind === 'manual')).toBe(
      true,
    )

    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, { ...sampleProduct, name: 'Later ring' })
    expect(await ipc<Product[]>(IPC_CHANNELS.PRODUCTS_LIST)).toHaveLength(2)

    const restored = await agent.post('/api/backup/restore-local').send({ name: backup.name })
    expect(restored.status).toBe(200)
    const products = await ipc<Product[]>(IPC_CHANNELS.PRODUCTS_LIST)
    expect(products).toHaveLength(1)
    expect(products[0]?.name).toBe('Test chain')

    const deleted = await agent.delete(`/api/backup/${encodeURIComponent(backup.name)}`)
    expect(deleted.status).toBe(204)
    const afterDelete = await agent.get('/api/backup/list')
    expect((afterDelete.body as BackupFile[]).some((file) => file.name === backup.name)).toBe(false)
    expect(existsSync(join(getUserDataDir(), 'backups', backup.name))).toBe(false)
  })

  it('rejects path traversal on restore and delete', async () => {
    const agent = getTestAgent()

    const restore = await agent.post('/api/backup/restore-local').send({ name: '../secret.db' })
    expect(restore.status).toBe(400)

    const missing = await agent.post('/api/backup/restore-local').send({
      name: 'jeweltrackerpro-manual-19990101-000000.db',
    })
    expect(missing.status).toBe(404)

    const deleted = await agent.delete(`/api/backup/${encodeURIComponent('../jeweltrackerpro-2026-01-01.db')}`)
    expect(deleted.status).toBe(400)
  })

  it('persists automatic backup frequency and time', async () => {
    const agent = getTestAgent()
    const saved = await agent.put('/api/backup/settings').send({ frequency: 'weekly', time: '09:30' })
    expect(saved.status).toBe(200)
    expect(saved.body.frequency).toBe('weekly')
    expect(saved.body.time).toBe('09:30')

    const status = await agent.get('/api/backup/status')
    expect(status.body.frequency).toBe('weekly')
    expect(status.body.time).toBe('09:30')
  })

  it('writes a scheduled backup when the last slot was missed and skips when current', async () => {
    const db = getDatabase()
    const today = localDateIso()
    const dailyPath = join(getUserDataDir(), 'backups', `jeweltrackerpro-${today}.db`)

    setShopSetting(db, LAST_BACKUP_AT_KEY, new Date(Date.now() - 3 * 86_400_000).toISOString())
    await ensureScheduledBackup()
    expect(existsSync(dailyPath)).toBe(true)
    assertSqliteIntegrity(dailyPath)

    const before = db.prepare('SELECT value FROM shop_settings WHERE key = ?').get(LAST_BACKUP_AT_KEY) as {
      value: string
    }
    await ensureScheduledBackup()
    const after = db.prepare('SELECT value FROM shop_settings WHERE key = ?').get(LAST_BACKUP_AT_KEY) as {
      value: string
    }
    expect(after.value).toBe(before.value)
  })
})
