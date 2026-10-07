import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import cors from 'cors'
import { getAppRoot, getAppVersion } from './lib/appPaths'
import express from 'express'
import { attachSession, requireAuth, requireFeature, requireRole } from './auth/middleware'
import { getDbPath } from './db'
import { errorMiddleware } from './lib/http'
import { getLogsDir } from './lib/logger'
import { getUploadsDir } from './lib/paths'
import authRoutes from './routes/auth.routes'
import backupRoutes from './routes/backup.routes'
import customersRoutes from './routes/customers.routes'
import diagnosticsRoutes from './routes/diagnostics.routes'
import duesRoutes from './routes/dues.routes'
import invoicesRoutes from './routes/invoices.routes'
import inwardsRoutes from './routes/inwards.routes'
import metalRatesRoutes from './routes/metalRates.routes'
import pledgesRoutes from './routes/pledges.routes'
import productsRoutes from './routes/products.routes'
import reportsRoutes from './routes/reports.routes'
import settingsRoutes from './routes/settings.routes'
import stockRoutes from './routes/stock.routes'
import stockAdjustmentsRoutes from './routes/stockAdjustments.routes'
import suppliersRoutes from './routes/suppliers.routes'
import oldGoldPurchasesRoutes from './routes/oldGoldPurchases.routes'
import usersRoutes from './routes/users.routes'
import goldSavingsRoutes from './routes/goldSavings.routes'

export function createApp(): express.Express {
  const rootDir = getAppRoot()
  const app = express()
  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: '2mb' }))
  app.use(attachSession)
  // Uploads are named with a random UUID and never overwritten, so a given URL
  // always serves the same bytes and can be cached indefinitely. Shop logos and
  // signatures are requested on every print preview, so this matters.
  app.use('/uploads', express.static(getUploadsDir(), { maxAge: '365d', immutable: true }))

  app.get('/api/version', (_req, res) => {
    res.json({
      version: getAppVersion(),
      dbPath: getDbPath(),
      logsPath: getLogsDir(),
    })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/diagnostics', diagnosticsRoutes)
  app.use('/api/users', requireAuth, requireRole('admin'), usersRoutes)
  app.use('/api/backup', requireAuth, requireFeature('settings'), backupRoutes)
  app.use('/api/customers', requireAuth, requireFeature('customers'), customersRoutes)
  app.use('/api/suppliers', requireAuth, requireFeature('inward'), suppliersRoutes)
  app.use('/api/inwards', requireAuth, requireFeature('inward'), inwardsRoutes)
  app.use('/api/old-gold-purchases', requireAuth, oldGoldPurchasesRoutes)
  app.use('/api/dues', requireAuth, requireFeature('dues'), duesRoutes)
  app.use('/api/invoices', requireAuth, requireFeature('billing'), invoicesRoutes)
  app.use('/api/pledges', requireAuth, requireFeature('billing'), pledgesRoutes)
  app.use('/api/metal-rates', requireAuth, metalRatesRoutes)
  app.use('/api/products', requireAuth, requireFeature('products'), productsRoutes)
  app.use('/api/settings', settingsRoutes)
  app.use('/api/stock/adjustments', requireAuth, requireFeature('stock'), stockAdjustmentsRoutes)
  app.use('/api/stock', requireAuth, requireFeature('stock'), stockRoutes)
  app.use('/api/reports', requireAuth, requireFeature('reports'), reportsRoutes)
  app.use('/api/gold-savings', requireAuth, requireFeature('gold_savings'), goldSavingsRoutes)

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  const distDir = join(rootDir, 'dist')
  if (existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          // Vite fingerprints everything under assets/, so those files are safe
          // to cache forever. The two HTML documents are not, because they are
          // what points at the current fingerprints.
          if (filePath.includes(`${sep}assets${sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          } else {
            res.setHeader('Cache-Control', 'no-cache')
          }
        },
      }),
    )
    // Print documents are a separate, much smaller entry so the preview iframe
    // does not have to load the whole application.
    const printDocument = join(distDir, 'print.html')
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next()
        return
      }
      const isPrint = req.path === '/print' || req.path.startsWith('/print/')
      res.sendFile(isPrint && existsSync(printDocument) ? printDocument : join(distDir, 'index.html'))
    })
  }

  app.use(errorMiddleware)
  return app
}
