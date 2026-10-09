import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import {
  pledgeAuctionInputSchema,
  pledgeAuctionNoticeInputSchema,
  pledgeAuctionSurplusInputSchema,
  pledgeCollectInputSchema,
  pledgeForfeitInputSchema,
  pledgeInputSchema,
  pledgePhotoKindSchema,
  pledgeRedeemInputSchema,
  pledgeRenewInputSchema,
  pledgeSanctionInputSchema,
  pledgeTopupInputSchema,
  pledgeUpdateInputSchema,
} from '@shared/schemas'
import {
  defaultRepaymentDueDate,
  clampRepaymentDueDate,
  formatAdgReceiptNo,
  parseAdgSeq,
} from '@shared/billing/pledgeMath'
import { itemValue, maxLoanForValue, ratePerGram } from '@shared/billing/pledgeValuation'
import { roundMoney } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import type {
  Pledge,
  PledgeAuctionInput,
  PledgeAuctionNoticeInput,
  PledgeAuctionSurplusInput,
  PledgeCollectInput,
  PledgeForfeitInput,
  PledgeInput,
  PledgeItem,
  PledgeItemInput,
  PledgePhotoKind,
  PledgeRedeemInput,
  PledgeRenewInput,
  PledgeStatus,
  PledgeTopupInput,
} from '@shared/types'
import { getDatabase } from '../db'
import { assertMetalsOpenForDate } from '../db/metalDayClosing'
import { syncDueEntryForPledge } from '../dues/pledgeSync'
import { asyncHandler, HttpError, parseBody, parseIdParam, parsePaging, queryString } from '../lib/http'
import { getUploadsDir } from '../lib/paths'
import { loadShopSettings } from '../lib/settingsStore'
import { loadPledgeAuction } from '../pledges/auctions'
import { loadPledgePayments } from '../pledges/ledger'
import { addPledgePhoto, deletePledgePhoto, loadPledgePhotos } from '../pledges/photos'
import { computePledgePayoff, recordPledgePayment } from '../pledges/payments'
import { buildPledgeReminders } from '../pledges/reminders'
import { loadPledgeTopups } from '../pledges/topups'
import { recordWeightMovement } from '../stock/movements'
import { getLatestMetalRates } from './metalRates.routes'

const router = Router()

const MAX_PHOTO_BYTES = 2 * 1024 * 1024

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadsDir()),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase()
      const safeExt = ext === '.jpeg' || ext === '.jpg' || ext === '.png' ? ext : '.png'
      cb(null, `${randomUUID()}${safeExt}`)
    },
  }),
  limits: { fileSize: MAX_PHOTO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g)$/i.test(file.mimetype)) {
      cb(new HttpError(400, 'Photo must be PNG or JPEG'))
      return
    }
    cb(null, true)
  },
})

const DEFAULT_PLEDGE_TYPE = 'GOLD JEWELLERY'
const EPSILON = 0.01

type PledgeRow = {
  id: number
  customer_id: number
  receipt_no: string
  pledge_date: string
  pledge_type: string
  guardian_name: string
  customer_address: string
  assessed_value: number
  loan_amount: number
  charges: number
  interest_pct: number
  repayment_due_date: string | null
  status: PledgeStatus
  redeemed_date: string | null
  amount_collected: number
  notes: string
  renewed_from_id: number | null
  renewed_to_id: number | null
  renewed_from_receipt?: string | null
  renewed_to_receipt?: string | null
  created_at: string
  customer_name: string
  customer_phone: string
  customer_aadhaar?: string | null
  customer_pan?: string | null
  customer_id_proof_type?: string | null
}

type PledgeItemRow = {
  id: number
  pledge_id: number
  description: string
  identification: string
  metal: string
  purity: string
  gross_weight: number
  stone_weight: number
  net_weight: number
  pieces: number
  rate_per_gram: number | null
  item_value: number | null
}

type CustomerSnapshot = {
  id: number
  address: string
  guardian_name: string
}

function peekNextReceiptNo(db: ReturnType<typeof getDatabase>): string {
  const rows = db
    .prepare(`SELECT receipt_no FROM pledges WHERE upper(receipt_no) LIKE 'ADG%'`)
    .all() as { receipt_no: string }[]
  let maxSeq = 0
  for (const row of rows) {
    const seq = parseAdgSeq(row.receipt_no)
    if (seq != null && seq > maxSeq) maxSeq = seq
  }
  return formatAdgReceiptNo(maxSeq + 1)
}

function nextReceiptNo(db: ReturnType<typeof getDatabase>): string {
  return peekNextReceiptNo(db)
}

function mapItem(row: PledgeItemRow): PledgeItem {
  return {
    id: row.id,
    pledgeId: row.pledge_id,
    description: row.description,
    identification: row.identification ?? '',
    metal: row.metal,
    purity: row.purity,
    grossWeight: row.gross_weight,
    stoneWeight: row.stone_weight ?? 0,
    netWeight: row.net_weight,
    pieces: row.pieces,
    ratePerGram: row.rate_per_gram ?? 0,
    itemValue: row.item_value ?? 0,
  }
}

function loadItems(db: ReturnType<typeof getDatabase>, pledgeId: number): PledgeItem[] {
  const rows = db
    .prepare(
      `SELECT id, pledge_id, description, identification, metal, purity,
              gross_weight, stone_weight, net_weight, pieces, rate_per_gram, item_value
       FROM pledge_items WHERE pledge_id = ? ORDER BY id`,
    )
    .all(pledgeId) as PledgeItemRow[]
  return rows.map(mapItem)
}

function mapPledge(db: ReturnType<typeof getDatabase>, row: PledgeRow): Pledge {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address ?? '',
    guardianName: row.guardian_name ?? '',
    customerAadhaar: row.customer_aadhaar ?? '',
    customerPan: row.customer_pan ?? '',
    customerIdProofType: row.customer_id_proof_type ?? '',
    receiptNo: row.receipt_no,
    pledgeDate: row.pledge_date,
    pledgeType: row.pledge_type || DEFAULT_PLEDGE_TYPE,
    assessedValue: row.assessed_value,
    loanAmount: row.loan_amount,
    charges: row.charges ?? 0,
    interestPct: row.interest_pct,
    repaymentDueDate: row.repayment_due_date,
    status: row.status,
    redeemedDate: row.redeemed_date,
    amountCollected: row.amount_collected,
    notes: row.notes,
    renewedFromId: row.renewed_from_id ?? null,
    renewedToId: row.renewed_to_id ?? null,
    renewedFromReceiptNo: row.renewed_from_receipt ?? undefined,
    renewedToReceiptNo: row.renewed_to_receipt ?? undefined,
    createdAt: row.created_at,
    items: loadItems(db, row.id),
    topups: loadPledgeTopups(db, row.id),
    payments: loadPledgePayments(db, row.id),
    photos: loadPledgePhotos(db, row.id),
  }
}

function mapPledgeSummary(row: PledgeRow & { item_count?: number }): Pledge {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address ?? '',
    guardianName: row.guardian_name ?? '',
    receiptNo: row.receipt_no,
    pledgeDate: row.pledge_date,
    pledgeType: row.pledge_type || DEFAULT_PLEDGE_TYPE,
    assessedValue: row.assessed_value,
    loanAmount: row.loan_amount,
    charges: row.charges ?? 0,
    interestPct: row.interest_pct,
    repaymentDueDate: row.repayment_due_date,
    status: row.status,
    redeemedDate: row.redeemed_date,
    amountCollected: row.amount_collected,
    notes: row.notes,
    renewedFromId: row.renewed_from_id ?? null,
    renewedToId: row.renewed_to_id ?? null,
    createdAt: row.created_at,
    items: [],
    itemCount: Number(row.item_count ?? 0),
    topups: [],
    payments: [],
    photos: [],
  }
}

function getPledgeRow(db: ReturnType<typeof getDatabase>, id: number): PledgeRow {
  const row = db
    .prepare(
      `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone,
              c.aadhaar AS customer_aadhaar, c.pan AS customer_pan,
              c.id_proof_type AS customer_id_proof_type,
              (SELECT receipt_no FROM pledges WHERE id = p.renewed_from_id) AS renewed_from_receipt,
              (SELECT receipt_no FROM pledges WHERE id = p.renewed_to_id) AS renewed_to_receipt
       FROM pledges p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.id = ?`,
    )
    .get(id) as PledgeRow | undefined
  if (!row) {
    throw new HttpError(404, 'Pledge not found')
  }
  return row
}

function insertItems(db: ReturnType<typeof getDatabase>, pledgeId: number, items: PledgeItemInput[]) {
  const rates = getLatestMetalRates(db)
  const insert = db.prepare(
    `INSERT INTO pledge_items (
      pledge_id, description, identification, metal, purity,
      gross_weight, stone_weight, net_weight, pieces, rate_per_gram, item_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const item of items) {
    const rate = item.ratePerGram ?? ratePerGram(rates, item.metal, item.purity)
    const value = item.itemValue ?? itemValue(rates, item.metal, item.purity, item.netWeight)
    insert.run(
      pledgeId,
      item.description,
      item.identification ?? '',
      item.metal,
      item.purity,
      item.grossWeight,
      item.stoneWeight ?? 0,
      item.netWeight,
      item.pieces,
      rate,
      value,
    )
  }
}

function assertActive(db: ReturnType<typeof getDatabase>, id: number) {
  const row = db.prepare('SELECT status FROM pledges WHERE id = ?').get(id) as
    | { status: PledgeStatus }
    | undefined
  if (!row) {
    throw new HttpError(404, 'Pledge not found')
  }
  if (row.status !== 'active') {
    throw new HttpError(400, 'Only active pledges can be modified')
  }
}

function assertEditable(db: ReturnType<typeof getDatabase>, id: number): PledgeStatus {
  const row = db.prepare('SELECT status FROM pledges WHERE id = ?').get(id) as
    | { status: PledgeStatus }
    | undefined
  if (!row) {
    throw new HttpError(404, 'Pledge not found')
  }
  if (row.status !== 'draft') {
    throw new HttpError(400, 'Sanctioned loans are locked. Use Extra loan or Renew.')
  }
  return row.status
}

function assertDraft(db: ReturnType<typeof getDatabase>, id: number) {
  const row = db.prepare('SELECT status FROM pledges WHERE id = ?').get(id) as
    | { status: PledgeStatus }
    | undefined
  if (!row) {
    throw new HttpError(404, 'Pledge not found')
  }
  if (row.status !== 'draft') {
    throw new HttpError(400, 'Only draft pledges can be sanctioned')
  }
}

function assertWithinLtv(
  db: ReturnType<typeof getDatabase>,
  input: { assessedValue: number; loanAmount: number; allowAboveLtv?: boolean },
  isAdmin: boolean,
): void {
  if (input.assessedValue <= 0) return
  const ltvPct = loadShopSettings(db).pledgeLtvPct
  const max = maxLoanForValue(input.assessedValue, ltvPct)
  if (input.loanAmount <= max + 0.01) return
  if (input.allowAboveLtv) {
    if (isAdmin) return
    throw new HttpError(403, 'Only an admin can sanction above the LTV limit')
  }
  throw new HttpError(
    400,
    `Loan exceeds the LTV limit of ${ltvPct}% (max ${max.toFixed(2)} on ${input.assessedValue.toFixed(2)})`,
  )
}

function assertKycForSanction(db: ReturnType<typeof getDatabase>, pledgeId: number): void {
  const settings = loadShopSettings(db)
  if (!settings.adaguRequireKyc) return
  const row = db
    .prepare(
      `SELECT c.aadhaar, c.pan FROM pledges p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.id = ?`,
    )
    .get(pledgeId) as { aadhaar: string | null; pan: string | null } | undefined
  if (!row) {
    throw new HttpError(404, 'Pledge not found')
  }
  const hasId = Boolean((row.aadhaar ?? '').trim() || (row.pan ?? '').trim())
  if (!hasId) {
    throw new HttpError(
      400,
      'KYC is required: enter the borrower Aadhaar or PAN before sanctioning',
    )
  }
}

function resolveBorrowerFields(
  db: ReturnType<typeof getDatabase>,
  input: PledgeInput,
): { guardianName: string; customerAddress: string; pledgeType: string; charges: number; repaymentDueDate: string } {
  const customer = db
    .prepare('SELECT id, address, guardian_name FROM customers WHERE id = ?')
    .get(input.customerId) as CustomerSnapshot | undefined
  if (!customer) {
    throw new HttpError(400, 'Customer not found')
  }

  return {
    guardianName: (input.guardianName ?? customer.guardian_name ?? '').trim(),
    customerAddress: (input.customerAddress ?? customer.address ?? '').trim(),
    pledgeType: (input.pledgeType ?? DEFAULT_PLEDGE_TYPE).trim() || DEFAULT_PLEDGE_TYPE,
    charges: Math.max(0, input.charges ?? 0),
    repaymentDueDate: clampRepaymentDueDate(
      input.repaymentDueDate ?? defaultRepaymentDueDate(input.pledgeDate),
      localTodayIso(),
    ),
  }
}

function savePledge(db: ReturnType<typeof getDatabase>, input: PledgeInput, pledgeId?: number): Pledge {
  const borrower = resolveBorrowerFields(db, input)
  const notes = input.notes ?? ''

  if (pledgeId) {
    assertEditable(db, pledgeId)
    db.prepare('DELETE FROM pledge_items WHERE pledge_id = ?').run(pledgeId)
    db.prepare(
      `UPDATE pledges SET
        customer_id = ?, pledge_date = ?, pledge_type = ?, guardian_name = ?, customer_address = ?,
        assessed_value = ?, loan_amount = ?, charges = ?, interest_pct = ?,
        repayment_due_date = ?, notes = ?
       WHERE id = ?`,
    ).run(
      input.customerId,
      input.pledgeDate,
      borrower.pledgeType,
      borrower.guardianName,
      borrower.customerAddress,
      input.assessedValue,
      input.loanAmount,
      borrower.charges,
      input.interestPct,
      borrower.repaymentDueDate,
      notes,
      pledgeId,
    )
    insertItems(db, pledgeId, input.items)
    return mapPledge(db, getPledgeRow(db, pledgeId))
  }

  const receiptNo = nextReceiptNo(db)
  const result = db
    .prepare(
      `INSERT INTO pledges (
        customer_id, receipt_no, pledge_date, pledge_type, guardian_name, customer_address,
        assessed_value, loan_amount, charges, interest_pct, repayment_due_date, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    )
    .run(
      input.customerId,
      receiptNo,
      input.pledgeDate,
      borrower.pledgeType,
      borrower.guardianName,
      borrower.customerAddress,
      input.assessedValue,
      input.loanAmount,
      borrower.charges,
      input.interestPct,
      borrower.repaymentDueDate,
      notes,
    )
  const id = Number(result.lastInsertRowid)
  insertItems(db, id, input.items)
  return mapPledge(db, getPledgeRow(db, id))
}

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const { page, pageSize, offset } = parsePaging(req.query)
    const sort = queryString(req.query, 'sort') === 'asc' ? 'ASC' : 'DESC'
    const clauses = ['1 = 1']
    const params: unknown[] = []
    const from = queryString(req.query, 'from')
    const to = queryString(req.query, 'to')
    const q = queryString(req.query, 'q')
    const status = queryString(req.query, 'status')
    if (from) {
      clauses.push('p.pledge_date >= ?')
      params.push(from)
    }
    if (to) {
      clauses.push('p.pledge_date <= ?')
      params.push(to)
    }
    if (q) {
      const like = `%${q}%`
      clauses.push('(p.receipt_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)')
      params.push(like, like, like)
    }
    if (
      status === 'draft' ||
      status === 'active' ||
      status === 'redeemed' ||
      status === 'forfeited' ||
      status === 'renewed'
    ) {
      clauses.push('p.status = ?')
      params.push(status)
    }
    const where = clauses.join(' AND ')
    const fromSql = `FROM pledges p JOIN customers c ON c.id = p.customer_id WHERE ${where}`
    const total = (db.prepare(`SELECT COUNT(*) AS n ${fromSql}`).get(...params) as { n: number }).n
    const rows = db
      .prepare(
        `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone,
                (SELECT COUNT(*) FROM pledge_items WHERE pledge_id = p.id) AS item_count
         ${fromSql}
         ORDER BY p.pledge_date ${sort}, p.id ${sort}
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as Array<PledgeRow & { item_count: number }>
    res.json({
      items: rows.map((row) => mapPledgeSummary(row)),
      total,
      page,
      pageSize,
    })
  }),
)

router.get(
  '/next-receipt-no',
  asyncHandler((_req, res) => {
    const db = getDatabase()
    res.json({ receiptNo: peekNextReceiptNo(db) })
  }),
)

// Must stay above `/:id`: "reminders" is not a numeric id.
router.get(
  '/reminders',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const asOf = queryString(req.query, 'date') || undefined
    res.json(buildPledgeReminders(db, asOf))
  }),
)

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const id = parseIdParam(req.params.id)
    res.json(mapPledge(db, getPledgeRow(db, id)))
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(pledgeInputSchema, req.body)
    const db = getDatabase()
    assertWithinLtv(db, input, req.user?.role === 'admin')
    const tx = db.transaction(() => savePledge(db, input))
    res.status(201).json(tx())
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeUpdateInputSchema, { ...req.body, id })
    const db = getDatabase()
    assertWithinLtv(db, input, req.user?.role === 'admin')
    const tx = db.transaction(() => savePledge(db, input, id))
    res.json(tx())
  }),
)

router.post(
  '/:id/sanction',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const body = parseBody(pledgeSanctionInputSchema, req.body ?? {})
    const db = getDatabase()
    const tx = db.transaction(() => {
      assertDraft(db, id)
      const row = getPledgeRow(db, id)
      assertKycForSanction(db, id)
      assertWithinLtv(
        db,
        {
          assessedValue: row.assessed_value,
          loanAmount: row.loan_amount,
          allowAboveLtv: body.allowAboveLtv,
        },
        req.user?.role === 'admin',
      )
      db.prepare(`UPDATE pledges SET status = 'active' WHERE id = ?`).run(id)
      syncDueEntryForPledge(db, id)
      return mapPledge(db, getPledgeRow(db, id))
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/redeem',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeRedeemInputSchema, { ...req.body, id }) as PledgeRedeemInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const payoff = computePledgePayoff(db, id, input.redeemedDate)
      if (!payoff) throw new HttpError(404, 'Pledge not found')
      const total = roundMoney(input.amountCollected + (input.discount ?? 0))
      if (total + 0.01 < payoff.payoff) {
        throw new HttpError(
          400,
          `Amount plus discount must cover the payoff of ${payoff.payoff.toFixed(2)}`,
        )
      }
      recordPledgePayment(db, {
        pledgeId: id,
        date: input.redeemedDate,
        amount: input.amountCollected,
        discount: input.discount ?? 0,
        mode: input.mode ?? 'cash',
        kind: 'redeem',
        note: `Redeemed ${payoff.payoff.toFixed(2)}`,
      })
      return mapPledge(db, getPledgeRow(db, id))
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/collect',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeCollectInputSchema, { ...req.body, id }) as PledgeCollectInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const payoff = computePledgePayoff(db, id, input.collectedDate)
      if (!payoff) throw new HttpError(404, 'Pledge not found')
      const interestOnly = input.amount <= payoff.interestDue + 0.01
      recordPledgePayment(db, {
        pledgeId: id,
        date: input.collectedDate,
        amount: input.amount,
        mode: input.mode ?? 'cash',
        kind: interestOnly ? 'interest' : 'part',
        note: interestOnly ? 'Interest collected' : 'Partial collection',
      })
      return mapPledge(db, getPledgeRow(db, id))
    })
    res.json(tx())
  }),
)

router.get(
  '/:id/payments',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const id = parseIdParam(req.params.id)
    getPledgeRow(db, id)
    res.json(loadPledgePayments(db, id))
  }),
)

router.get(
  '/:id/photos',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const id = parseIdParam(req.params.id)
    getPledgeRow(db, id)
    res.json(loadPledgePhotos(db, id))
  }),
)

router.post(
  '/:id/photos',
  photoUpload.single('file'),
  asyncHandler((req, res) => {
    const db = getDatabase()
    const id = parseIdParam(req.params.id)
    const row = getPledgeRow(db, id)
    if (row.status !== 'draft' && row.status !== 'active') {
      throw new HttpError(400, 'Photos can be added only to draft or active loans')
    }
    if (!req.file) {
      throw new HttpError(400, 'Photo file is required')
    }
    const kind = pledgePhotoKindSchema.parse(
      (typeof req.body?.kind === 'string' && req.body.kind.trim()) || 'item',
    ) as PledgePhotoKind
    res.status(201).json(addPledgePhoto(db, id, kind, `/uploads/${req.file.filename}`))
  }),
)

router.delete(
  '/:id/photos/:photoId',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const id = parseIdParam(req.params.id)
    getPledgeRow(db, id)
    res.json(deletePledgePhoto(db, id, parseIdParam(req.params.photoId)))
  }),
)

router.get(
  '/:id/payoff',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const id = parseIdParam(req.params.id)
    getPledgeRow(db, id)
    const asOf = queryString(req.query, 'date') || undefined
    res.json(computePledgePayoff(db, id, asOf))
  }),
)

router.post(
  '/:id/forfeit',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeForfeitInputSchema, { ...req.body, id }) as PledgeForfeitInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      assertActive(db, id)
      db.prepare(
        `UPDATE pledges SET
          status = 'forfeited',
          redeemed_date = ?
         WHERE id = ?`,
      ).run(input.forfeitedDate, id)
      syncDueEntryForPledge(db, id)
      return mapPledge(db, getPledgeRow(db, id))
    })
    res.json(tx())
  }),
)

router.get(
  '/:id/topups',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const id = parseIdParam(req.params.id)
    getPledgeRow(db, id)
    res.json(loadPledgeTopups(db, id))
  }),
)

router.get(
  '/:id/auction',
  asyncHandler((req, res) => {
    const db = getDatabase()
    const id = parseIdParam(req.params.id)
    getPledgeRow(db, id)
    res.json(loadPledgeAuction(db, id))
  }),
)

router.post(
  '/:id/auction-notice',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeAuctionNoticeInputSchema, {
      ...req.body,
      id,
    }) as PledgeAuctionNoticeInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      assertActive(db, id)
      const row = getPledgeRow(db, id)
      if (input.noticeDate < row.pledge_date) {
        throw new HttpError(400, 'Notice date cannot be before the pledge date')
      }
      if (!row.repayment_due_date || row.repayment_due_date >= input.noticeDate) {
        throw new HttpError(
          400,
          'An auction notice can be sent only after the repayment due date',
        )
      }
      db.prepare(
        `INSERT INTO pledge_auctions (pledge_id, notice_date) VALUES (?, ?)
         ON CONFLICT(pledge_id) DO UPDATE SET notice_date = excluded.notice_date`,
      ).run(id, input.noticeDate)
      return loadPledgeAuction(db, id)
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/auction',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeAuctionInputSchema, { ...req.body, id }) as PledgeAuctionInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      assertActive(db, id)
      const auction = loadPledgeAuction(db, id)
      if (!auction) {
        throw new HttpError(400, 'Send an auction notice before recording the auction')
      }
      if (input.auctionDate < auction.auctionEligibleDate) {
        throw new HttpError(
          400,
          `The notice period ends on ${auction.auctionEligibleDate}; the auction cannot be recorded before then`,
        )
      }
      const payoff = computePledgePayoff(db, id, input.auctionDate)
      if (!payoff) throw new HttpError(404, 'Pledge not found')

      const sale = roundMoney(Math.max(0, input.saleAmount))
      const collected = roundMoney(Math.min(sale, payoff.payoff))
      const shortfall = roundMoney(Math.max(0, payoff.payoff - sale))
      const surplus = roundMoney(Math.max(0, sale - payoff.payoff))
      const writeOffDiscount =
        shortfall > EPSILON && input.writeOffShortfall ? shortfall : 0

      if (collected > EPSILON) {
        recordPledgePayment(db, {
          pledgeId: id,
          date: input.auctionDate,
          amount: collected,
          discount: writeOffDiscount,
          mode: 'auction',
          kind: 'auction',
          note: input.buyerName
            ? `Auction sale to ${input.buyerName}`
            : 'Auction sale',
          closeWhenSettled: false,
        })
      } else if (writeOffDiscount > EPSILON) {
        throw new HttpError(
          400,
          'Enter the sale amount before writing off the shortfall',
        )
      }

      if (input.buyerType === 'shop') {
        const items = loadItems(db, id)
        const receiptNo = getPledgeRow(db, id).receipt_no
        const categories = new Map(
          (input.items ?? []).map((entry) => [entry.pledgeItemId, entry.category]),
        )
        try {
          assertMetalsOpenForDate(db, input.auctionDate, items.map((item) => item.metal))
          for (const item of items) {
            const category = categories.get(item.id)
            if (!category) {
              throw new HttpError(400, `Pick a stock category for item "${item.description}"`)
            }
            recordWeightMovement(db, {
              type: 'purchase',
              metal: item.metal,
              category,
              weightDelta: item.netWeight,
              refType: 'pledge_auction',
              refId: id,
              reason: 'Adagu auction buyback',
              note: `From pledge ${receiptNo}`,
              operatorId: req.user?.id ?? null,
              movementDate: input.auctionDate,
            })
          }
        } catch (err) {
          if (err instanceof HttpError) throw err
          throw new HttpError(400, err instanceof Error ? err.message : 'Stock update failed')
        }
      }

      db.prepare(
        `UPDATE pledge_auctions SET
           auction_date = ?, buyer_type = ?, buyer_name = ?, sale_amount = ?,
           payoff_at_auction = ?, surplus_amount = ?, shortfall_amount = ?,
           shortfall_written_off = ?, note = ?
         WHERE pledge_id = ?`,
      ).run(
        input.auctionDate,
        input.buyerType,
        input.buyerName ?? '',
        sale,
        payoff.payoff,
        surplus,
        shortfall,
        input.writeOffShortfall ? 1 : 0,
        input.note ?? '',
        id,
      )

      db.prepare(
        `UPDATE pledges SET status = 'forfeited', redeemed_date = ? WHERE id = ?`,
      ).run(input.auctionDate, id)
      syncDueEntryForPledge(db, id)
      return mapPledge(db, getPledgeRow(db, id))
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/auction-surplus-paid',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeAuctionSurplusInputSchema, {
      ...req.body,
      id,
    }) as PledgeAuctionSurplusInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      const auction = loadPledgeAuction(db, id)
      if (!auction) throw new HttpError(404, 'No auction recorded for this pledge')
      if (auction.surplusAmount <= EPSILON) {
        throw new HttpError(400, 'This auction has no surplus to pay')
      }
      db.prepare(
        `UPDATE pledge_auctions SET surplus_paid_date = ?, surplus_mode = ? WHERE pledge_id = ?`,
      ).run(input.surplusPaidDate, input.mode ?? 'cash', id)
      return loadPledgeAuction(db, id)
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/renew',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeRenewInputSchema, { ...req.body, id }) as PledgeRenewInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      assertActive(db, id)
      const row = getPledgeRow(db, id)
      if (input.renewDate < row.pledge_date) {
        throw new HttpError(400, 'Renewal date cannot be before the pledge date')
      }
      const payoff = computePledgePayoff(db, id, input.renewDate)
      if (!payoff) throw new HttpError(404, 'Pledge not found')

      // 1. Clear the interest due on the old ticket.
      if (payoff.interestDue > EPSILON) {
        recordPledgePayment(db, {
          pledgeId: id,
          date: input.renewDate,
          amount: payoff.interestDue,
          mode: input.mode ?? 'cash',
          kind: 'renewal',
          note: input.note ? `Renewal interest · ${input.note}` : 'Renewal interest',
          closeWhenSettled: false,
        })
      }

      const afterInterest = computePledgePayoff(db, id, input.renewDate)
      const outstanding = afterInterest ? afterInterest.principalOutstanding : 0
      const newLoan = Math.max(0, input.newLoanAmount ?? outstanding)
      const transferAmount = Math.min(newLoan, outstanding)
      const shortfall = Math.max(0, outstanding - newLoan)

      // 2. Transfer the principal that carries over to the new ticket.
      if (transferAmount > EPSILON) {
        recordPledgePayment(db, {
          pledgeId: id,
          date: input.renewDate,
          amount: transferAmount,
          mode: 'transfer',
          kind: 'transfer',
          note: `Transferred to renewal ticket`,
        })
      }

      // 2b. If the new loan is smaller, collect the difference on the old ticket.
      if (shortfall > EPSILON) {
        recordPledgePayment(db, {
          pledgeId: id,
          date: input.renewDate,
          amount: shortfall,
          mode: input.mode ?? 'cash',
          kind: 'part',
          note: 'Principal collected on renewal',
        })
      }

      // 3. Retire the old ticket.
      db.prepare(`UPDATE pledges SET status = 'renewed' WHERE id = ?`).run(id)

      // 4. Create the new active ticket.
      const settings = loadShopSettings(db)
      const receiptNo = nextReceiptNo(db)
      const oldItems = loadItems(db, id)
      const inserted = db
        .prepare(
          `INSERT INTO pledges (
             customer_id, receipt_no, pledge_date, pledge_type, guardian_name, customer_address,
             assessed_value, loan_amount, charges, interest_pct, repayment_due_date, status, notes,
             renewed_from_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'active', ?, ?)`,
        )
        .run(
          row.customer_id,
          receiptNo,
          input.renewDate,
          row.pledge_type || DEFAULT_PLEDGE_TYPE,
          row.guardian_name ?? '',
          row.customer_address ?? '',
          row.assessed_value,
          newLoan,
          settings.adaguInterestPct,
          defaultRepaymentDueDate(input.renewDate),
          input.note ?? `Renewed from ${row.receipt_no}`,
          id,
        )
      const newId = Number(inserted.lastInsertRowid)
      insertItems(db, newId, oldItems)
      db.prepare('UPDATE pledges SET renewed_to_id = ? WHERE id = ?').run(newId, id)
      syncDueEntryForPledge(db, newId)

      return mapPledge(db, getPledgeRow(db, newId))
    })
    res.status(201).json(tx())
  }),
)

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const tx = db.transaction(() => {
      const row = db.prepare('SELECT status FROM pledges WHERE id = ?').get(id) as
        | { status: PledgeStatus }
        | undefined
      if (!row) throw new HttpError(404, 'Pledge not found')
      if (row.status !== 'draft') {
        throw new HttpError(400, 'Only draft pledges can be deleted')
      }
      db.prepare('DELETE FROM pledge_items WHERE pledge_id = ?').run(id)
      db.prepare('DELETE FROM pledge_topups WHERE pledge_id = ?').run(id)
      db.prepare('DELETE FROM pledge_payments WHERE pledge_id = ?').run(id)
      db.prepare('DELETE FROM pledges WHERE id = ?').run(id)
      return { id }
    })
    res.json(tx())
  }),
)

router.post(
  '/:id/topup',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeTopupInputSchema, { ...req.body, pledgeId: id }) as PledgeTopupInput
    const db = getDatabase()
    const tx = db.transaction(() => {
      assertActive(db, id)
      const row = getPledgeRow(db, id)
      if (input.topupDate < row.pledge_date) {
        throw new HttpError(400, 'Top-up date cannot be before the pledge date')
      }

      db.prepare(
        `INSERT INTO pledge_topups (pledge_id, topup_date, amount, interest_pct, note)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, input.topupDate, input.amount, row.interest_pct, input.note ?? '')

      syncDueEntryForPledge(db, id)
      return mapPledge(db, getPledgeRow(db, id))
    })
    res.status(201).json(tx())
  }),
)

export default router
