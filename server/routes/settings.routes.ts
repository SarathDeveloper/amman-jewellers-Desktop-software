import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { shopSettingsSchema } from '@shared/schemas'
import { requireFeature } from '../auth/middleware'
import { getDatabase } from '../db'
import { asyncHandler, HttpError, parseBody } from '../lib/http'
import { getUploadsDir } from '../lib/paths'
import { loadShopSettings, saveShopSettings } from '../lib/settingsStore'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadsDir()),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase()
      const safeExt = ext === '.jpeg' || ext === '.jpg' || ext === '.png' ? ext : '.png'
      cb(null, `${randomUUID()}${safeExt}`)
    },
  }),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g)$/i.test(file.mimetype)) {
      cb(new HttpError(400, 'Image must be PNG or JPEG'))
      return
    }
    cb(null, true)
  },
})

const router = Router()

router.get(
  '/',
  asyncHandler((_req, res) => {
    res.json(loadShopSettings(getDatabase()))
  }),
)

router.get(
  '/counts',
  requireFeature('settings'),
  asyncHandler((_req, res) => {
    const db = getDatabase()
    const products = (db.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n
    const customers = (db.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number }).n
    res.json({ products, customers })
  }),
)

router.put(
  '/',
  requireFeature('settings'),
  asyncHandler((req, res) => {
    const input = parseBody(shopSettingsSchema, req.body)
    res.json(saveShopSettings(getDatabase(), input))
  }),
)

router.post(
  '/image',
  requireFeature('settings'),
  upload.single('file'),
  asyncHandler((req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'Image file is required')
    }
    res.json({ path: `/uploads/${req.file.filename}` })
  }),
)

export default router
