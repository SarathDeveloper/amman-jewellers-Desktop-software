import { existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { backupSettingsSchema, inspectBackupSchema, restoreBackupNameSchema } from '@shared/schemas'
import {
  backupDatabaseTo,
  copyNewestBackupOffsite,
  createManualBackup,
  deleteBackup,
  getBackupStatus,
  getOffsiteDir,
  inspectBackup,
  listBackups,
  restoreBackupByName,
  restoreDatabaseFrom,
  updateBackupSchedule,
  withBackupLock,
} from '../db/backup'
import { writeExcelBackupFromDatabaseYielding } from '../db/excelBackup'
import { getDatabase, getDbPath } from '../db'
import { asyncHandler, HttpError, parseBody } from '../lib/http'

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024 },
})

const router = Router()

function removeTempFile(filePath: string | undefined): void {
  if (!filePath) return
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  } catch {
    // A leftover temp file is not worth failing the request over.
  }
}

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
  '/inspect',
  asyncHandler((req, res) => {
    const { name } = parseBody(inspectBackupSchema, req.body)
    res.json(inspectBackup(name))
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
    await withBackupLock(async () => {
      await backupDatabaseTo(destination)
    })
    res.download(destination, filename, () => removeTempFile(destination))
  }),
)

router.get(
  '/export-excel',
  asyncHandler(async (_req, res) => {
    const filename = `jeweltrackerpro-tables-${new Date().toISOString().slice(0, 10)}.xlsx`
    const destination = join(tmpdir(), filename)
    await withBackupLock(async () => {
      await writeExcelBackupFromDatabaseYielding(getDatabase(), destination)
    })
    res.download(destination, filename, () => removeTempFile(destination))
  }),
)

router.post(
  '/restore',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'Backup file is required')
    }
    try {
      const status = await restoreDatabaseFrom(req.file.path)
      res.json(status)
    } finally {
      removeTempFile(req.file.path)
    }
  }),
)

router.post(
  '/restore-local',
  asyncHandler(async (req, res) => {
    const { name } = parseBody(restoreBackupNameSchema, req.body)
    res.json(await restoreBackupByName(name))
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
