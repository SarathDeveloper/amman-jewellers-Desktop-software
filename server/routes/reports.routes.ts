import { Router } from 'express'
import { reportQuerySchema } from '@shared/schemas'
import { findReport, REPORTS, type ReportLookups } from '@shared/reportsCatalog'
import { getDatabase } from '../db'
import { asyncHandler, HttpError } from '../lib/http'
import { runReport } from '../reports/runReport'

const router = Router()

router.get(
  '/',
  asyncHandler((_req, res) => {
    res.json(REPORTS)
  }),
)

router.get(
  '/lookups',
  asyncHandler((_req, res) => {
    const db = getDatabase()
    const lookups: ReportLookups = {
      customers: db
        .prepare(`SELECT id, name FROM customers ORDER BY name COLLATE NOCASE`)
        .all() as ReportLookups['customers'],
      suppliers: db
        .prepare(`SELECT id, name FROM suppliers ORDER BY name COLLATE NOCASE`)
        .all() as ReportLookups['suppliers'],
      products: db
        .prepare(`SELECT id, name FROM products ORDER BY name COLLATE NOCASE`)
        .all() as ReportLookups['products'],
    }
    res.json(lookups)
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const report = findReport(String(req.params.id))
    if (!report) {
      throw new HttpError(404, 'Report not found')
    }
    const query = reportQuerySchema.parse(req.query)
    res.json(runReport(report.id, query))
  }),
)

export default router
