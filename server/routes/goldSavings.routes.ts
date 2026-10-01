import { Router } from 'express'
import {
  goldSavingAccountInputSchema,
  goldSavingCancelAccountSchema,
  goldSavingPaymentInputSchema,
  goldSavingRedemptionInputSchema,
  goldSavingReportIdSchema,
  goldSavingReversePaymentSchema,
  goldSavingSchemeInputSchema,
} from '@shared/schemas'
import { cancelAccount, enrollAccount, getAccountDetail, listAccounts } from '../goldSavings/accountService'
import { collectPayment, getPayment, reversePayment } from '../goldSavings/collectionService'
import { getDashboard } from '../goldSavings/dashboardService'
import { getPassbook, listAudit, listLedger } from '../goldSavings/ledgerService'
import { listRedemptions, processRedemption } from '../goldSavings/maturityService'
import { runGoldSavingReport } from '../goldSavings/reportService'
import { createScheme, getScheme, listSchemes, updateScheme } from '../goldSavings/schemeService'
import { getDatabase } from '../db'
import { asyncHandler, HttpError, parseBody, parseIdParam } from '../lib/http'

const router = Router()

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function actor(req: { user?: { id: number; role: string } | null }) {
  if (!req.user) throw new HttpError(401, 'Authentication required')
  return { id: req.user.id, isAdmin: req.user.role === 'admin' }
}

function requireAdmin(req: { user?: { role: string } | null }) {
  if (req.user?.role !== 'admin') {
    throw new HttpError(403, 'Permission denied')
  }
}

router.get(
  '/schemes',
  asyncHandler((_req, res) => {
    res.json(listSchemes(getDatabase()))
  }),
)

router.get(
  '/schemes/:id',
  asyncHandler((req, res) => {
    res.json(getScheme(getDatabase(), parseIdParam(routeParam(req.params.id))))
  }),
)

router.post(
  '/schemes',
  asyncHandler((req, res) => {
    const input = parseBody(goldSavingSchemeInputSchema, req.body)
    res.status(201).json(createScheme(getDatabase(), input, actor(req).id))
  }),
)

router.put(
  '/schemes/:id',
  asyncHandler((req, res) => {
    const input = parseBody(goldSavingSchemeInputSchema, req.body)
    res.json(updateScheme(getDatabase(), parseIdParam(routeParam(req.params.id)), input, actor(req).id))
  }),
)

router.get(
  '/accounts',
  asyncHandler((req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined
    res.json(listAccounts(getDatabase(), q))
  }),
)

router.get(
  '/accounts/:id/ledger',
  asyncHandler((req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined
    const to = typeof req.query.to === 'string' ? req.query.to : undefined
    res.json(listLedger(getDatabase(), parseIdParam(routeParam(req.params.id)), { from, to }))
  }),
)

router.get(
  '/accounts/:id/passbook',
  asyncHandler((req, res) => {
    res.json(getPassbook(getDatabase(), parseIdParam(routeParam(req.params.id))))
  }),
)

router.get(
  '/accounts/:id/audit',
  asyncHandler((req, res) => {
    res.json(listAudit(getDatabase(), parseIdParam(routeParam(req.params.id))))
  }),
)

router.get(
  '/accounts/:id',
  asyncHandler((req, res) => {
    res.json(getAccountDetail(getDatabase(), parseIdParam(routeParam(req.params.id))))
  }),
)

router.post(
  '/accounts',
  asyncHandler((req, res) => {
    const input = parseBody(goldSavingAccountInputSchema, req.body)
    res.status(201).json(enrollAccount(getDatabase(), input, actor(req)))
  }),
)

router.post(
  '/accounts/:id/cancel',
  asyncHandler((req, res) => {
    requireAdmin(req)
    const input = parseBody(goldSavingCancelAccountSchema, req.body)
    res.json(cancelAccount(getDatabase(), parseIdParam(routeParam(req.params.id)), input.reason, actor(req).id))
  }),
)

router.get(
  '/payments/:id',
  asyncHandler((req, res) => {
    res.json(getPayment(getDatabase(), parseIdParam(routeParam(req.params.id))))
  }),
)

router.post(
  '/payments',
  asyncHandler((req, res) => {
    const input = parseBody(goldSavingPaymentInputSchema, req.body)
    res.status(201).json(collectPayment(getDatabase(), input, actor(req)))
  }),
)

router.post(
  '/payments/:id/reverse',
  asyncHandler((req, res) => {
    requireAdmin(req)
    const input = parseBody(goldSavingReversePaymentSchema, req.body)
    res.json(reversePayment(getDatabase(), parseIdParam(routeParam(req.params.id)), input.reason, actor(req).id))
  }),
)

router.get(
  '/redemptions',
  asyncHandler((req, res) => {
    const accountId = req.query.accountId ? parseIdParam(String(req.query.accountId)) : undefined
    res.json(listRedemptions(getDatabase(), accountId))
  }),
)

router.post(
  '/redemptions',
  asyncHandler((req, res) => {
    const input = parseBody(goldSavingRedemptionInputSchema, req.body)
    res.status(201).json(processRedemption(getDatabase(), input, actor(req).id))
  }),
)

router.get(
  '/dashboard',
  asyncHandler((_req, res) => {
    res.json(getDashboard(getDatabase()))
  }),
)

router.get(
  '/reports/:reportId',
  asyncHandler((req, res) => {
    const parsed = goldSavingReportIdSchema.safeParse(routeParam(req.params.reportId))
    if (!parsed.success) {
      throw new HttpError(404, 'Report not found')
    }
    const from = typeof req.query.from === 'string' ? req.query.from : undefined
    const to = typeof req.query.to === 'string' ? req.query.to : undefined
    const q = typeof req.query.q === 'string' ? req.query.q : undefined
    const schemeId = req.query.schemeId ? Number(req.query.schemeId) : undefined
    const customerId = req.query.customerId ? Number(req.query.customerId) : undefined
    res.json(
      runGoldSavingReport(getDatabase(), parsed.data, {
        from,
        to,
        q,
        schemeId: schemeId && Number.isInteger(schemeId) ? schemeId : undefined,
        customerId: customerId && Number.isInteger(customerId) ? customerId : undefined,
      }),
    )
  }),
)

export default router
