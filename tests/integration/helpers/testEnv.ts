import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach } from 'vitest'
import request from 'supertest'
import type { IpcResult } from '@shared/types'
import { createApp } from '../../../server/app'
import { clearAllSessionsForTests } from '../../../server/auth/session'
import { seedE2eAdmin } from '../../../server/auth/users'
import { backupDatabaseTo, restoreDatabaseFrom } from '../../../server/db/backup'
import { closeDatabase, getDatabase, initDatabase } from '../../../server/db'

export const IPC_CHANNELS = {
  APP_VERSION: 'app:version',
  APP_EXPORT_DB: 'app:exportDb',
  APP_RESTORE_DB: 'app:restoreDb',
  APP_BACKUP_STATUS: 'app:backupStatus',
  PRODUCTS_LIST: 'products:list',
  PRODUCTS_GET: 'products:get',
  PRODUCTS_VARIANTS: 'products:variants',
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_UPDATE: 'products:update',
  PRODUCTS_DELETE: 'products:delete',
  STOCK_LIST: 'stock:list',
  STOCK_UPSERT: 'stock:upsert',
  STOCK_CREATE_CATEGORY: 'stock:createCategory',
  STOCK_UPDATE_CATEGORY: 'stock:updateCategory',
  STOCK_DELETE_CATEGORY: 'stock:deleteCategory',
  STOCK_CLEAR_OVERRIDES: 'stock:clearSalesOverrides',
  STOCK_HISTORY: 'stock:history',
  STOCK_DAY_LINES: 'stock:dayLines',
  STOCK_DAY_CLOSING_GET: 'stock:dayClosingGet',
  STOCK_DAY_CLOSING_CLOSE: 'stock:dayClosingClose',
  STOCK_DAY_CLOSING_REOPEN: 'stock:dayClosingReopen',
  STOCK_CATEGORIES_LIST: 'stock:categoriesList',
  STOCK_DAY_CLOSING_PRECHECK: 'stock:dayClosingPrecheck',
  STOCK_RECONCILIATION: 'stock:reconciliation',
  STOCK_ADJUSTMENT_LIST: 'stock:adjustmentList',
  STOCK_ADJUSTMENT_CREATE: 'stock:adjustmentCreate',
  STOCK_ADJUSTMENT_GET: 'stock:adjustmentGet',
  STOCKTAKE_LIST: 'stocktakeList',
  STOCKTAKE_CREATE: 'stocktakeCreate',
  STOCKTAKE_GET: 'stocktakeGet',
  STOCKTAKE_UPDATE_LINES: 'stocktakeUpdateLines',
  STOCKTAKE_POST: 'stocktakePost',
  CUSTOMERS_LIST: 'customers:list',
  CUSTOMERS_GET: 'customers:get',
  CUSTOMERS_CREATE: 'customers:create',
  CUSTOMERS_UPDATE: 'customers:update',
  CUSTOMERS_DELETE: 'customers:delete',
  SUPPLIERS_LIST: 'suppliers:list',
  SUPPLIERS_CREATE: 'suppliers:create',
  INWARDS_CREATE: 'inwards:create',
  INWARDS_FINALIZE: 'inwards:finalize',
  INWARDS_GET: 'inwards:get',
  OLD_GOLD_PURCHASES_LIST: 'oldGoldPurchases:list',
  OLD_GOLD_PURCHASES_CREATE: 'oldGoldPurchases:create',
  OLD_GOLD_PURCHASES_GET: 'oldGoldPurchases:get',
  OLD_GOLD_PURCHASES_UPDATE: 'oldGoldPurchases:update',
  OLD_GOLD_PURCHASES_FINALIZE: 'oldGoldPurchases:finalize',
  OLD_GOLD_PURCHASES_DELETE: 'oldGoldPurchases:delete',
  OLD_GOLD_PURCHASES_BY_NO: 'oldGoldPurchases:byNo',
  DUES_LIST: 'dues:list',
  DUES_CREATE: 'dues:create',
  DUES_UPDATE: 'dues:update',
  DUES_DELETE: 'dues:delete',
  DUES_RECORD_PAYMENT: 'dues:recordPayment',
  DUES_MARK_PAID: 'dues:markPaid',
  INVOICES_LIST: 'invoices:list',
  INVOICES_GET: 'invoices:get',
  INVOICES_CREATE: 'invoices:create',
  INVOICES_RECORD_HISTORICAL: 'invoices:recordHistorical',
  INVOICES_UPDATE: 'invoices:update',
  INVOICES_FINALIZE: 'invoices:finalize',
  INVOICES_DELETE: 'invoices:delete',
  INVOICES_TAX_REPORT: 'invoices:taxReport',
  REPORTS_CATALOG: 'reports:catalog',
  REPORTS_RUN: 'reports:run',
  SETTINGS_GET: 'settings:get',
  SETTINGS_COUNTS: 'settings:counts',
  SETTINGS_UPDATE: 'settings:update',
  METAL_RATES_LATEST: 'metalRates:latest',
  METAL_RATES_LIST: 'metalRates:list',
  METAL_RATES_UPSERT: 'metalRates:upsert',
} as const

let tempDir = ''
let app = createApp()
let httpAgent = request.agent(app)

function agent() {
  return httpAgent
}

function toResult(response: request.Response): IpcResult<unknown> {
  if (response.status >= 200 && response.status < 300) {
    return { ok: true, data: response.status === 204 ? undefined : response.body }
  }
  const error =
    typeof response.body?.error === 'string' ? response.body.error : response.text || 'Request failed'
  const referenceId = typeof response.body?.referenceId === 'string' ? response.body.referenceId : undefined
  return referenceId ? { ok: false, error, referenceId } : { ok: false, error }
}

export async function loginAsAdmin(): Promise<void> {
  seedE2eAdmin(getDatabase())
  const response = await agent().post('/api/auth/login').send({
    username: 'admin',
    password: 'admin123',
  })
  if (response.status !== 200) {
    throw new Error(`Admin login failed: ${response.text}`)
  }
}

export async function invokeIpcForTests<T>(channel: string, rawInput?: unknown): Promise<IpcResult<T>> {
  const input = rawInput as Record<string, unknown> | string | number | undefined
  let response: request.Response

  switch (channel) {
    case IPC_CHANNELS.APP_VERSION:
      response = await agent().get('/api/version')
      break
    case IPC_CHANNELS.APP_BACKUP_STATUS:
      response = await agent().get('/api/backup/status')
      break
    case IPC_CHANNELS.APP_EXPORT_DB: {
      const destinationPath = (input as { destinationPath: string }).destinationPath
      try {
        const data = await backupDatabaseTo(destinationPath)
        return { ok: true, data: data as T }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Export failed',
        }
      }
    }
    case IPC_CHANNELS.APP_RESTORE_DB: {
      const sourcePath = (input as { sourcePath: string }).sourcePath
      try {
        const data = restoreDatabaseFrom(sourcePath)
        return { ok: true, data: data as T }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Restore failed'
        return { ok: false, error: message }
      }
    }
    case IPC_CHANNELS.PRODUCTS_LIST:
      response = await agent().get('/api/products').query(typeof input === 'string' ? { q: input } : {})
      break
    case IPC_CHANNELS.PRODUCTS_GET:
      response = await agent().get(`/api/products/${input}`)
      break
    case IPC_CHANNELS.PRODUCTS_VARIANTS:
      response = await agent().get(`/api/products/${input}/variants`)
      break
    case IPC_CHANNELS.PRODUCTS_CREATE:
      response = await agent().post('/api/products').send(input)
      break
    case IPC_CHANNELS.PRODUCTS_UPDATE: {
      const { id, input: body } = input as { id: number; input: unknown }
      response = await agent().put(`/api/products/${id}`).send(body)
      break
    }
    case IPC_CHANNELS.PRODUCTS_DELETE:
      response = await agent().delete(`/api/products/${input}`)
      break
    case IPC_CHANNELS.STOCK_LIST:
      response = await agent().get('/api/stock').query(input as object)
      break
    case IPC_CHANNELS.STOCK_UPSERT:
      response = await agent().post('/api/stock').send(input)
      break
    case IPC_CHANNELS.STOCK_CREATE_CATEGORY:
      response = await agent().post('/api/stock/categories').send(input)
      break
    case IPC_CHANNELS.STOCK_UPDATE_CATEGORY:
      response = await agent().put('/api/stock/categories').send(input)
      break
    case IPC_CHANNELS.STOCK_DELETE_CATEGORY:
      response = await agent().delete('/api/stock/categories').send(input)
      break
    case IPC_CHANNELS.STOCK_CLEAR_OVERRIDES:
      response = await agent().post('/api/stock/clear-overrides').send(input)
      break
    case IPC_CHANNELS.STOCK_HISTORY:
      response = await agent().get('/api/stock/history').query(input as object)
      break
    case IPC_CHANNELS.STOCK_DAY_LINES:
      response = await agent().get('/api/stock/day-lines').query(input as object)
      break
    case IPC_CHANNELS.STOCK_DAY_CLOSING_GET:
      response = await agent().get('/api/stock/day-closings').query(input as object)
      break
    case IPC_CHANNELS.STOCK_DAY_CLOSING_CLOSE:
      response = await agent().post('/api/stock/day-closings/close').send(input)
      break
    case IPC_CHANNELS.STOCK_DAY_CLOSING_REOPEN:
      response = await agent().post('/api/stock/day-closings/reopen').send(input)
      break
    case IPC_CHANNELS.STOCK_CATEGORIES_LIST:
      response = await agent().get('/api/stock/categories')
      break
    case IPC_CHANNELS.STOCK_DAY_CLOSING_PRECHECK:
      response = await agent().get('/api/stock/day-closings/precheck').query(input as object)
      break
    case IPC_CHANNELS.STOCK_RECONCILIATION:
      response = await agent().get('/api/stock/reconciliation').query(input as object)
      break
    case IPC_CHANNELS.STOCK_ADJUSTMENT_LIST:
      response = await agent().get('/api/stock/adjustments')
      break
    case IPC_CHANNELS.STOCK_ADJUSTMENT_CREATE:
      response = await agent().post('/api/stock/adjustments').send(input)
      break
    case IPC_CHANNELS.STOCK_ADJUSTMENT_GET:
      response = await agent().get(`/api/stock/adjustments/${input}`)
      break
    case IPC_CHANNELS.STOCKTAKE_LIST:
      response = await agent().get('/api/stock/stocktakes')
      break
    case IPC_CHANNELS.STOCKTAKE_CREATE:
      response = await agent().post('/api/stock/stocktakes').send(input)
      break
    case IPC_CHANNELS.STOCKTAKE_GET:
      response = await agent().get(`/api/stock/stocktakes/${input}`)
      break
    case IPC_CHANNELS.STOCKTAKE_UPDATE_LINES: {
      const { id, body } = input as { id: number; body: unknown }
      response = await agent().put(`/api/stock/stocktakes/${id}/lines`).send(body)
      break
    }
    case IPC_CHANNELS.STOCKTAKE_POST:
      response = await agent().post(`/api/stock/stocktakes/${input}/post`)
      break
    case IPC_CHANNELS.CUSTOMERS_LIST:
      response = await agent().get('/api/customers').query(typeof input === 'string' ? { q: input } : {})
      break
    case IPC_CHANNELS.CUSTOMERS_GET:
      response = await agent().get(`/api/customers/${input}`)
      break
    case IPC_CHANNELS.CUSTOMERS_CREATE:
      response = await agent().post('/api/customers').send(input)
      break
    case IPC_CHANNELS.CUSTOMERS_UPDATE: {
      const { id, input: body } = input as { id: number; input: unknown }
      response = await agent().put(`/api/customers/${id}`).send(body)
      break
    }
    case IPC_CHANNELS.CUSTOMERS_DELETE:
      response = await agent().delete(`/api/customers/${input}`)
      break
    case IPC_CHANNELS.SUPPLIERS_LIST:
      response = await agent().get('/api/suppliers').query(typeof input === 'string' ? { q: input } : {})
      break
    case IPC_CHANNELS.SUPPLIERS_CREATE:
      response = await agent().post('/api/suppliers').send(input)
      break
    case IPC_CHANNELS.INWARDS_CREATE:
      response = await agent().post('/api/inwards').send(input)
      break
    case IPC_CHANNELS.INWARDS_GET:
      response = await agent().get(`/api/inwards/${input}`)
      break
    case IPC_CHANNELS.INWARDS_FINALIZE:
      response = await agent().post(`/api/inwards/${input}/finalize`)
      break
    case IPC_CHANNELS.OLD_GOLD_PURCHASES_LIST:
      response = await agent().get('/api/old-gold-purchases')
      break
    case IPC_CHANNELS.OLD_GOLD_PURCHASES_CREATE:
      response = await agent().post('/api/old-gold-purchases').send(input)
      break
    case IPC_CHANNELS.OLD_GOLD_PURCHASES_GET:
      response = await agent().get(`/api/old-gold-purchases/${input}`)
      break
    case IPC_CHANNELS.OLD_GOLD_PURCHASES_UPDATE:
      response = await agent()
        .put(`/api/old-gold-purchases/${(input as { id: number }).id}`)
        .send(input)
      break
    case IPC_CHANNELS.OLD_GOLD_PURCHASES_FINALIZE:
      response = await agent().post(`/api/old-gold-purchases/${input}/finalize`)
      break
    case IPC_CHANNELS.OLD_GOLD_PURCHASES_DELETE:
      response = await agent().delete(`/api/old-gold-purchases/${input}`)
      break
    case IPC_CHANNELS.OLD_GOLD_PURCHASES_BY_NO:
      response = await agent().get(`/api/old-gold-purchases/by-no/${encodeURIComponent(String(input))}`)
      break
    case IPC_CHANNELS.DUES_LIST:
      response = await agent().get('/api/dues').query(typeof input === 'string' ? { q: input } : {})
      break
    case IPC_CHANNELS.DUES_CREATE:
      response = await agent().post('/api/dues').send(input)
      break
    case IPC_CHANNELS.DUES_UPDATE:
      response = await agent()
        .put(`/api/dues/${(input as { id: number }).id}`)
        .send(input)
      break
    case IPC_CHANNELS.DUES_DELETE:
      response = await agent().delete(`/api/dues/${input}`)
      break
    case IPC_CHANNELS.DUES_RECORD_PAYMENT:
      response = await agent()
        .post(`/api/dues/${(input as { dueEntryId: number }).dueEntryId}/payment`)
        .send(input)
      break
    case IPC_CHANNELS.DUES_MARK_PAID:
      response = await agent().post(`/api/dues/${input}/mark-paid`)
      break
    case IPC_CHANNELS.INVOICES_LIST: {
      response = await agent().get('/api/invoices').query({ page: 1, pageSize: 50 })
      if (response.status >= 200 && response.status < 300 && Array.isArray(response.body?.items)) {
        return { ok: true, data: response.body.items } as IpcResult<T>
      }
      break
    }
    case IPC_CHANNELS.INVOICES_GET:
      response = await agent().get(`/api/invoices/${input}`)
      break
    case IPC_CHANNELS.INVOICES_CREATE:
      response = await agent().post('/api/invoices').send(input)
      break
    case IPC_CHANNELS.INVOICES_RECORD_HISTORICAL:
      response = await agent().post('/api/invoices/historical').send(input)
      break
    case IPC_CHANNELS.INVOICES_UPDATE:
      response = await agent()
        .put(`/api/invoices/${(input as { id: number }).id}`)
        .send(input)
      break
    case IPC_CHANNELS.INVOICES_FINALIZE:
      response = await agent().post(`/api/invoices/${input}/finalize`)
      break
    case IPC_CHANNELS.INVOICES_DELETE:
      response = await agent().delete(`/api/invoices/${input}`)
      break
    case IPC_CHANNELS.INVOICES_TAX_REPORT:
      response = await agent().get('/api/invoices/tax-report')
      break
    case IPC_CHANNELS.REPORTS_CATALOG:
      response = await agent().get('/api/reports')
      break
    case IPC_CHANNELS.REPORTS_RUN: {
      const { id, ...query } = input as {
        id: string
        from?: string
        to?: string
        customerId?: number
        supplierId?: number
        productId?: number
        metal?: string
        qtyCutoff?: number
      }
      response = await agent().get(`/api/reports/${id}`).query(query)
      break
    }
    case IPC_CHANNELS.SETTINGS_GET:
      response = await agent().get('/api/settings')
      break
    case IPC_CHANNELS.SETTINGS_COUNTS:
      response = await agent().get('/api/settings/counts')
      break
    case IPC_CHANNELS.SETTINGS_UPDATE:
      response = await agent().put('/api/settings').send(input)
      break
    case IPC_CHANNELS.METAL_RATES_LATEST:
      response = await agent().get('/api/metal-rates/latest')
      break
    case IPC_CHANNELS.METAL_RATES_LIST:
      response = await agent().get('/api/metal-rates')
      break
    case IPC_CHANNELS.METAL_RATES_UPSERT:
      response = await agent().post('/api/metal-rates').send(input)
      break
    default:
      throw new Error(`No HTTP mapping for ${channel}`)
  }

  return toResult(response) as IpcResult<T>
}

export function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.data
}

export async function ipc<T>(channel: string, input?: unknown): Promise<T> {
  return unwrap(await invokeIpcForTests<T>(channel, input))
}

export function useIntegrationEnv(): void {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'jtp-int-'))
    process.env.JEWELTRACKERPRO_E2E_USER_DATA = tempDir
    clearAllSessionsForTests()
    closeDatabase()
    initDatabase()
    app = createApp()
    httpAgent = request.agent(app)
    await loginAsAdmin()
  })

  afterEach(() => {
    clearAllSessionsForTests()
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.JEWELTRACKERPRO_E2E_USER_DATA
  })
}

export function getTestAgent() {
  return agent()
}

export function dbVersions(): number[] {
  const db = getDatabase()
  return db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => (row as { version: number }).version)
}

let huidSerial = 0

export function testHuids(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, () => {
    huidSerial += 1
    return `H${String(huidSerial).padStart(5, '0')}`
  })
}

export function withHuids<T extends { stockQty?: number }>(input: T): T & { huids: string[] } {
  return { ...input, huids: testHuids(input.stockQty ?? 0) }
}
