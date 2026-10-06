import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { backupSettingsSchema, restoreBackupNameSchema } from '@shared/schemas'
import {
  backupDatabaseTo,
  copyNewestBackupOffsite,
  createManualBackup,
  deleteBackup,
  getBackupStatus,
  getOffsiteDir,
  listBackups,
  restoreBackupByName,
  restoreDatabaseFrom,
  updateBackupSchedule,
} from '../db/backup'
import { writeExcelBackupFromDatabase } from '../db/excelBackup'
import { getDatabase, getDbPath } from '../db'
import { asyncHandler, HttpError, parseBody } from '../lib/http'

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024 },
})

const router = Router()

router.get(
  '/status',
  asyncHandler((_req, res) => {
    res.json(getBackupStatus())
  }),
)

router.put(
  '/settings',
  asyncHandler((req, res) => {
    const input = parseBody(backupSettingsSchema, req.body)
    res.json(updateBackupSchedule(input))
  }),
)

router.get(
  '/list',
  asyncHandler((_req, res) => {
    res.json(listBackups())
  }),
)

router.post(
  '/create',
  asyncHandler(async (_req, res) => {
    res.json(await createManualBackup())
  }),
)

router.post(
  '/offsite-copy',
  asyncHandler(async (_req, res) => {
    if (!getOffsiteDir()) {
      throw new HttpError(400, 'Choose an off-machine folder first')
    }
    const status = await copyNewestBackupOffsite({ forceFresh: true })
    if (status.lastOffsiteError) {
      throw new HttpError(400, status.lastOffsiteError)
    }
    res.json(status)
  }),
)

router.get(
  '/export',
  asyncHandler(async (_req, res) => {
    const filename = `jeweltrackerpro-backup-${new Date().toISOString().slice(0, 10)}.db`
    const destination = join(tmpdir(), filename)
    await backupDatabaseTo(destination)
    res.download(destination, filename)
  }),
)

router.get(
  '/export-excel',
  asyncHandler((_req, res) => {
    const filename = `jeweltrackerpro-tables-${new Date().toISOString().slice(0, 10)}.xlsx`
    const destination = join(tmpdir(), filename)
    writeExcelBackupFromDatabase(getDatabase(), destination)
    res.download(destination, filename)
  }),
)

router.post(
  '/restore',
  upload.single('file'),
  asyncHandler((req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'Backup file is required')
    }
    const status = restoreDatabaseFrom(req.file.path)
    res.json(status)
  }),
)

router.post(
  '/restore-local',
  asyncHandler((req, res) => {
    const { name } = parseBody(restoreBackupNameSchema, req.body)
    res.json(restoreBackupByName(name))
  }),
)

router.delete(
  '/:name',
  asyncHandler((req, res) => {
    const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name
    if (!name) {
      throw new HttpError(400, 'Invalid backup file name')
    }
    deleteBackup(name)
    res.status(204).end()
  }),
)

router.get(
  '/path',
  asyncHandler((_req, res) => {
    const dbPath = getDbPath()
    res.json({ dbPath, exists: existsSync(dbPath) })
  }),
)

export default router
