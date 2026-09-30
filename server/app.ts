import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import cors from 'cors'
import { getAppRoot } from './lib/appPaths'
import express from 'express'
import { attachSession, requireAuth, requireFeature, requireRole } from './auth/middleware'
import { getDbPath } from './db'
import { errorMiddleware } from './lib/http'
import { getLogsDir } from './lib/logger'
import { getUploadsDir } from './lib/paths'
import authRoutes from './routes/auth.routes'
import backupRoutes from './routes/backup.routes'
import customersRoutes from './routes/customers.routes'
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

export function createApp(): express.Express {
  const rootDir = getAppRoot()
  const app = express()
  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json({ limit: '2mb' }))
  app.use(attachSession)
  app.use('/uploads', express.static(getUploadsDir()))

  app.get('/api/version', (_req, res) => {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
      version: string
    }
    res.json({
      version: pkg.version,
      dbPath: getDbPath(),
      logsPath: getLogsDir(),
    })
  })

  app.use('/api/auth', authRoutes)
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

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  const distDir = join(rootDir, 'dist')
  if (existsSync(distDir)) {
    app.use(express.static(distDir))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next()
        return
      }
      res.sendFile(join(distDir, 'index.html'))
    })
  }

  app.use(errorMiddleware)
  return app
}
