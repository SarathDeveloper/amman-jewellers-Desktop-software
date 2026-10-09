import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { BackupFile, BackupInspection, BackupStatus, Product } from '@shared/types'
import {
  assertSqliteIntegrity,
  backupDatabaseTo,
  copyNewestBackupOffsite,
  ensureDailyBackup,
  ensureScheduledBackup,
  LAST_BACKUP_AT_KEY,
  proveBackupRestores,
  restoreDatabaseFrom,
  tickScheduledBackup,
} from '../../server/db/backup'
import { getDatabase, getUserDataDir } from '../../server/db'
import { latestMigrationVersion } from '../../server/db/migrations'
import { writePremigrateSnapshot } from '../../server/db/snapshot'
import { getUploadsDir } from '../../server/lib/paths'
import { setShopSetting } from '../../server/lib/settingsStore'
import { localDateIso } from '../../shared/localDate'
import { getTestAgent, IPC_CHANNELS, ipc, useIntegrationEnv, withHuids } from './helpers/testEnv'

const sampleProduct = withHuids({
  name: 'Test chain',
  category: 'Chain',
  metal: 'Gold',
  purity: '22K',
  grossWeight: 10,
  netWeight: 9.5,
  makingCharges: 100,
  stockQty: 5,
  imagePath: '',
})

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

    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({ ...sampleProduct, name: 'Later ring' }))
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
    const excelPath = join(getUserDataDir(), 'backups', `jeweltrackerpro-${today}.xlsx`)
    expect(existsSync(dailyPath)).toBe(true)
    assertSqliteIntegrity(dailyPath)
    expect(existsSync(excelPath)).toBe(true)
    const excel = readFileSync(excelPath)
    expect(excel.subarray(0, 2).toString()).toBe('PK')
    expect(excel.toString('utf8')).toContain('Test chain')
    expect(excel.toString('utf8')).toContain('products')
    const hash = getDatabase().prepare('SELECT password_hash FROM users LIMIT 1').get() as {
      password_hash: string
    }
    expect(hash.password_hash.length).toBeGreaterThan(8)
    expect(excel.toString('utf8')).not.toContain(hash.password_hash)
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
    const excelPath = join(getUserDataDir(), 'backups', backup.name.replace(/\.db$/, '.xlsx'))
    expect(existsSync(excelPath)).toBe(true)

    const listed = await agent.get('/api/backup/list')
    expect(listed.status).toBe(200)
    expect((listed.body as BackupFile[]).some((file) => file.name === backup.name && file.kind === 'manual')).toBe(
      true,
    )

    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({ ...sampleProduct, name: 'Later ring' }))
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
    expect(existsSync(excelPath)).toBe(false)
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
    expect(saved.body.offsiteDir).toBe('')
    expect(saved.body.lastOffsiteAt).toBeNull()
    expect(saved.body.lastOffsiteError).toBeNull()

    const status = await agent.get('/api/backup/status')
    expect(status.body.frequency).toBe('weekly')
    expect(status.body.time).toBe('09:30')
    expect(status.body.offsiteDir).toBe('')
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

  it('rejects an off-machine folder inside app data', async () => {
    const agent = getTestAgent()
    const inside = await agent.put('/api/backup/settings').send({
      frequency: 'daily',
      time: '21:00',
      offsiteDir: getUserDataDir(),
    })
    expect(inside.status).toBe(400)
    expect(inside.body.error).toBe("Choose a folder outside this computer's app data")

    const backups = await agent.put('/api/backup/settings').send({
      frequency: 'daily',
      time: '21:00',
      offsiteDir: join(getUserDataDir(), 'backups'),
    })
    expect(backups.status).toBe(400)

    const relative = await agent.put('/api/backup/settings').send({
      frequency: 'daily',
      time: '21:00',
      offsiteDir: 'backups',
    })
    expect(relative.status).toBe(400)
    expect(relative.body.error).toBe('Choose an absolute folder path')
  })

  it('copies the newest backup off-machine, verifies it, and restores shop data from that file', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-offsite-'))
    const today = localDateIso()
    const offsitePath = join(offsiteDir, `jeweltrackerpro-${today}.db`)

    try {
      const saved = await agent.put('/api/backup/settings').send({
        frequency: 'daily',
        time: '21:00',
        offsiteDir,
      })
      expect(saved.status).toBe(200)
      expect(saved.body.offsiteDir).toBeTruthy()

      const copied = await agent.post('/api/backup/offsite-copy')
      expect(copied.status).toBe(200)
      expect(copied.body.lastOffsiteAt).toBeTruthy()
      expect(copied.body.lastOffsiteError).toBeNull()
      expect(existsSync(offsitePath)).toBe(true)
      assertSqliteIntegrity(offsitePath)
      const offsiteExcel = join(offsiteDir, `jeweltrackerpro-${today}.xlsx`)
      expect(existsSync(offsiteExcel)).toBe(true)
      expect(readFileSync(offsiteExcel).toString('utf8')).toContain('Test chain')
      await proveBackupRestores(offsitePath, join(getUserDataDir(), 'backups', `jeweltrackerpro-${today}.db`))

      const skipped = await copyNewestBackupOffsite()
      expect(skipped.lastOffsiteAt).toBe(copied.body.lastOffsiteAt)

      await ipc(IPC_CHANNELS.PRODUCTS_CREATE, withHuids({ ...sampleProduct, name: 'Later ring' }))
      expect(await ipc<Product[]>(IPC_CHANNELS.PRODUCTS_LIST)).toHaveLength(2)

      await restoreDatabaseFrom(offsitePath)
      const products = await ipc<Product[]>(IPC_CHANNELS.PRODUCTS_LIST)
      expect(products).toHaveLength(1)
      expect(products[0]?.name).toBe('Test chain')
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('records a missing off-machine folder without skipping the local backup', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()
    const parent = mkdtempSync(join(tmpdir(), 'jtp-offsite-parent-'))
    const missing = join(parent, 'not-plugged-in')

    try {
      const saved = await agent.put('/api/backup/settings').send({
        frequency: 'daily',
        time: '21:00',
        offsiteDir: missing,
      })
      expect(saved.status).toBe(200)

      const copied = await agent.post('/api/backup/offsite-copy')
      expect(copied.status).toBe(400)
      expect(copied.body.error).toBe('Off-machine folder was not found')

      const status = await agent.get('/api/backup/status')
      expect(status.body.lastBackupAt).toBeTruthy()
      expect(status.body.lastOffsiteAt).toBeNull()
      expect(status.body.lastOffsiteError).toBe('Off-machine folder was not found')
      expect(existsSync(join(getUserDataDir(), 'backups', `jeweltrackerpro-${localDateIso()}.db`))).toBe(true)
      expect(existsSync(join(missing, `jeweltrackerpro-${localDateIso()}.db`))).toBe(false)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('copies off-machine after a scheduled local backup', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-offsite-tick-'))
    const today = localDateIso()
    const agent = getTestAgent()

    try {
      await agent.put('/api/backup/settings').send({
        frequency: 'daily',
        time: '21:00',
        offsiteDir,
      })
      setShopSetting(getDatabase(), LAST_BACKUP_AT_KEY, new Date(Date.now() - 3 * 86_400_000).toISOString())
      await tickScheduledBackup()

      const localPath = join(getUserDataDir(), 'backups', `jeweltrackerpro-${today}.db`)
      const offsitePath = join(offsiteDir, `jeweltrackerpro-${today}.db`)
      expect(existsSync(localPath)).toBe(true)
      expect(existsSync(offsitePath)).toBe(true)
      expect(existsSync(join(offsiteDir, `jeweltrackerpro-${today}.xlsx`))).toBe(true)
      assertSqliteIntegrity(offsitePath)

      const status = await agent.get('/api/backup/status')
      expect(status.body.lastOffsiteAt).toBeTruthy()
      expect(status.body.lastOffsiteError).toBeNull()
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('downloads an Excel workbook of every table', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()
    const exported = await agent
      .get('/api/backup/export-excel')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.from(chunk))
        })
        res.on('end', () => {
          callback(null, Buffer.concat(chunks))
        })
      })
    expect(exported.status).toBe(200)
    const body = Buffer.isBuffer(exported.body) ? exported.body : Buffer.from(exported.body)
    expect(body.subarray(0, 2).toString()).toBe('PK')
    expect(body.toString('utf8')).toContain('Test chain')
    expect(body.toString('utf8')).toContain('_tables')
    expect(body.toString('utf8')).toContain('invoices')
  })

  it('rejects a file that is not a JewelTrackerPro backup without touching live data', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()
    const backupsDir = join(getUserDataDir(), 'backups')
    mkdirSync(backupsDir, { recursive: true })
    const foreignPath = join(backupsDir, 'jeweltrackerpro-2020-01-01.db')
    const foreign = new Database(foreignPath)
    foreign.exec('CREATE TABLE foo (id INTEGER PRIMARY KEY)')
    foreign.close()

    const response = await agent
      .post('/api/backup/restore-local')
      .send({ name: 'jeweltrackerpro-2020-01-01.db' })
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('This file is not a JewelTrackerPro backup')
    expect(await ipc<Product[]>(IPC_CHANNELS.PRODUCTS_LIST)).toHaveLength(1)
  })

  it('rejects a backup made by a newer version of the app', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()
    const backupsDir = join(getUserDataDir(), 'backups')
    mkdirSync(backupsDir, { recursive: true })
    const target = join(backupsDir, 'jeweltrackerpro-2020-01-02.db')
    await backupDatabaseTo(target)
    const snapshot = new Database(target)
    snapshot
      .prepare(
        'UPDATE schema_migrations SET version = ? WHERE version = (SELECT MAX(version) FROM schema_migrations)',
      )
      .run(latestMigrationVersion() + 1)
    snapshot.close()

    const response = await agent
      .post('/api/backup/restore-local')
      .send({ name: 'jeweltrackerpro-2020-01-02.db' })
    expect(response.status).toBe(400)
    expect(response.body.error).toContain('newer version')
    expect(await ipc<Product[]>(IPC_CHANNELS.PRODUCTS_LIST)).toHaveLength(1)
  })

  it('keeps a pre-restore safety copy and rolls back a restore that cannot open', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const backupsDir = join(getUserDataDir(), 'backups')
    mkdirSync(backupsDir, { recursive: true })

    // A healthy SQLite file that carries the required tables but claims schema
    // 55 with no `customers` table, so migration 56 fails after the copy-in.
    const stubPath = join(backupsDir, 'jeweltrackerpro-manual-19990101-000000.db')
    const stub = new Database(stubPath)
    stub.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO schema_migrations (version) VALUES (55);
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE shop_settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE products (id INTEGER PRIMARY KEY);
      CREATE TABLE invoices (id INTEGER PRIMARY KEY);
    `)
    stub.close()

    await expect(restoreDatabaseFrom(stubPath)).rejects.toThrow()
    expect(await ipc<Product[]>(IPC_CHANNELS.PRODUCTS_LIST)).toHaveLength(1)
    expect(readdirSync(backupsDir).some((name) => name.startsWith('jeweltrackerpro-prerestore-'))).toBe(
      true,
    )
  })

  it('writes a safety snapshot before applying pending migrations', () => {
    const backupsDir = join(getUserDataDir(), 'backups')
    mkdirSync(backupsDir, { recursive: true })
    const premigrateFiles = () =>
      readdirSync(backupsDir).filter((name) => name.startsWith('jeweltrackerpro-premigrate-'))

    // The fresh database from beforeEach applied every migration, so nothing was written.
    expect(premigrateFiles()).toHaveLength(0)

    const name = writePremigrateSnapshot(getDatabase(), latestMigrationVersion())
    expect(premigrateFiles()).toContain(name)
    assertSqliteIntegrity(join(backupsDir, name))
  })

  it('backs up after a metal day close and leaves the schedule due', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-offsite-dayclose-'))
    try {
      await agent
        .put('/api/backup/settings')
        .send({ frequency: 'daily', time: '21:00', offsiteDir })

      const closed = await agent.post('/api/stock/day-closings/close').send({
        businessDate: localDateIso(),
        metal: 'Gold',
        operatorName: 'admin',
        note: '',
      })
      expect(closed.status).toBe(200)
      expect(closed.body.backupSaved).toBe(true)

      const backupsDir = join(getUserDataDir(), 'backups')
      const dayCloseFiles = readdirSync(backupsDir).filter(
        (name) => name.startsWith('jeweltrackerpro-dayclose-') && name.endsWith('.db'),
      )
      expect(dayCloseFiles).toHaveLength(1)
      // Excel copies are only written for daily and manual snapshots.
      expect(existsSync(join(backupsDir, dayCloseFiles[0]!.replace(/\.db$/, '.xlsx')))).toBe(false)
      expect(existsSync(join(offsiteDir, `jeweltrackerpro-${localDateIso()}.db`))).toBe(true)

      const status = await agent.get('/api/backup/status')
      expect(status.body.lastBackupAt).toBeTruthy()
      // The day-close backup must not satisfy the scheduled slot.
      expect(status.body.nextBackupAt).toBeNull()
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('mirrors shop images off-machine and copies them back on restore', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-offsite-media-'))
    const uploadsDir = getUploadsDir()
    const imageName = 'logo-test.png'
    writeFileSync(join(uploadsDir, imageName), 'fake-image-bytes')

    try {
      await agent
        .put('/api/backup/settings')
        .send({ frequency: 'daily', time: '21:00', offsiteDir })
      const copied = await agent.post('/api/backup/offsite-copy')
      expect(copied.status).toBe(200)
      expect(existsSync(join(offsiteDir, 'uploads', imageName))).toBe(true)

      rmSync(join(uploadsDir, imageName))
      await restoreDatabaseFrom(join(offsiteDir, `jeweltrackerpro-${localDateIso()}.db`))
      expect(existsSync(join(uploadsDir, imageName))).toBe(true)
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('detects a tampered off-machine copy', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()
    const offsiteDir = mkdtempSync(join(tmpdir(), 'jtp-offsite-tamper-'))
    const localPath = join(getUserDataDir(), 'backups', `jeweltrackerpro-${localDateIso()}.db`)
    const offsitePath = join(offsiteDir, `jeweltrackerpro-${localDateIso()}.db`)
    try {
      await agent
        .put('/api/backup/settings')
        .send({ frequency: 'daily', time: '21:00', offsiteDir })
      await agent.post('/api/backup/offsite-copy')
      appendFileSync(offsitePath, 'tampered')
      await expect(proveBackupRestores(offsitePath, localPath)).rejects.toThrow()
    } finally {
      rmSync(offsiteDir, { recursive: true, force: true })
    }
  })

  it('reports what a backup contains without restoring it', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()
    const created = await agent.post('/api/backup/create')
    const backup = created.body as BackupFile

    const inspected = await agent.post('/api/backup/inspect').send({ name: backup.name })
    expect(inspected.status).toBe(200)
    const result = inspected.body as BackupInspection
    expect(result.restorable).toBe(true)
    expect(result.schemaVersion).toBe(latestMigrationVersion())
    expect(result.appSchemaVersion).toBe(latestMigrationVersion())
    expect(result.counts.products).toBe(1)
    expect(result.issues).toHaveLength(0)
  })

  it('removes the temporary export file after a download', async () => {
    await ipc(IPC_CHANNELS.PRODUCTS_CREATE, sampleProduct)
    const agent = getTestAgent()
    const exportPath = join(tmpdir(), `jeweltrackerpro-backup-${new Date().toISOString().slice(0, 10)}.db`)
    const exported = await agent.get('/api/backup/export')
    expect(exported.status).toBe(200)

    for (let attempt = 0; attempt < 40 && existsSync(exportPath); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(existsSync(exportPath)).toBe(false)
  })
})
