import { Router } from 'express'
import {
  pledgeCollectInputSchema,
  pledgeForfeitInputSchema,
  pledgeInputSchema,
  pledgeRedeemInputSchema,
  pledgeTopupInputSchema,
  pledgeUpdateInputSchema,
} from '@shared/schemas'
import { defaultRepaymentDueDate, clampRepaymentDueDate, formatAdgReceiptNo, parseAdgSeq } from '@shared/billing/pledgeMath'
import { roundMoney } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import type {
  Pledge,
  PledgeCollectInput,
  PledgeForfeitInput,
  PledgeInput,
  PledgeItem,
  PledgeItemInput,
  PledgeRedeemInput,
  PledgeStatus,
  PledgeTopupInput,
  PledgeUpdateInput,
} from '@shared/types'
import { getDatabase } from '../db'
import { syncDueEntryForPledge } from '../dues/pledgeSync'
import { asyncHandler, HttpError, parseBody, parseIdParam } from '../lib/http'
import { computePledgeDueWithLoadedTopups, loadPledgeTopups } from '../pledges/topups'

const router = Router()

const DEFAULT_PLEDGE_TYPE = 'GOLD JEWELLERY'

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
  created_at: string
  customer_name: string
  customer_phone: string
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
  }
}

function loadItems(db: ReturnType<typeof getDatabase>, pledgeId: number): PledgeItem[] {
  const rows = db
    .prepare(
      `SELECT id, pledge_id, description, identification, metal, purity,
              gross_weight, stone_weight, net_weight, pieces
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
    createdAt: row.created_at,
    items: loadItems(db, row.id),
    topups: loadPledgeTopups(db, row.id),
  }
}

function getPledgeRow(db: ReturnType<typeof getDatabase>, id: number): PledgeRow {
  const row = db
    .prepare(
      `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone
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
  const insert = db.prepare(
    `INSERT INTO pledge_items (
      pledge_id, description, identification, metal, purity,
      gross_weight, stone_weight, net_weight, pieces
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const item of items) {
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
  if (row.status !== 'active' && row.status !== 'draft') {
    throw new HttpError(400, 'Only draft or active pledges can be modified')
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
    const currentStatus = assertEditable(db, pledgeId)
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
    const pledge = mapPledge(db, getPledgeRow(db, pledgeId))
    if (currentStatus === 'active') {
      syncDueEntryForPledge(db, pledgeId)
    }
    return pledge
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
  asyncHandler((_req, res) => {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone
         FROM pledges p
         JOIN customers c ON c.id = p.customer_id
         ORDER BY p.pledge_date DESC, p.id DESC`,
      )
      .all() as PledgeRow[]
    res.json(rows.map((row) => mapPledge(db, row)))
  }),
)

router.get(
  '/next-receipt-no',
  asyncHandler((_req, res) => {
    const db = getDatabase()
    res.json({ receiptNo: peekNextReceiptNo(db) })
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
    res.status(201).json(savePledge(db, input))
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeUpdateInputSchema, { ...req.body, id })
    const db = getDatabase()
    res.json(savePledge(db, input, id))
  }),
)

router.post(
  '/:id/sanction',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    assertDraft(db, id)
    db.prepare(`UPDATE pledges SET status = 'active' WHERE id = ?`).run(id)
    syncDueEntryForPledge(db, id)
    res.json(mapPledge(db, getPledgeRow(db, id)))
  }),
)

router.post(
  '/:id/redeem',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeRedeemInputSchema, { ...req.body, id }) as PledgeRedeemInput
    const db = getDatabase()
    assertActive(db, id)
    const row = getPledgeRow(db, id)
    const nextCollected = roundMoney(row.amount_collected + input.amountCollected)
    db.prepare(
      `UPDATE pledges SET
        status = 'redeemed',
        redeemed_date = ?,
        amount_collected = ?
       WHERE id = ?`,
    ).run(input.redeemedDate, nextCollected, id)
    syncDueEntryForPledge(db, id)
    res.json(mapPledge(db, getPledgeRow(db, id)))
  }),
)

router.post(
  '/:id/collect',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeCollectInputSchema, { ...req.body, id }) as PledgeCollectInput
    const db = getDatabase()
    assertActive(db, id)
    const row = getPledgeRow(db, id)
    const { due } = computePledgeDueWithLoadedTopups(
      db,
      {
        id: row.id,
        loan_amount: row.loan_amount,
        interest_pct: row.interest_pct,
        pledge_date: row.pledge_date,
        amount_collected: row.amount_collected,
      },
      input.collectedDate,
    )
    const nextCollected = roundMoney(row.amount_collected + input.amount)
    if (nextCollected >= due.totalDue) {
      db.prepare(
        `UPDATE pledges SET
          status = 'redeemed',
          redeemed_date = ?,
          amount_collected = ?
         WHERE id = ?`,
      ).run(input.collectedDate, nextCollected, id)
    } else {
      db.prepare(`UPDATE pledges SET amount_collected = ? WHERE id = ?`).run(nextCollected, id)
    }
    syncDueEntryForPledge(db, id)
    res.json(mapPledge(db, getPledgeRow(db, id)))
  }),
)

router.post(
  '/:id/forfeit',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeForfeitInputSchema, { ...req.body, id }) as PledgeForfeitInput
    const db = getDatabase()
    assertActive(db, id)
    db.prepare(
      `UPDATE pledges SET
        status = 'forfeited',
        redeemed_date = ?
       WHERE id = ?`,
    ).run(input.forfeitedDate, id)
    syncDueEntryForPledge(db, id)
    res.json(mapPledge(db, getPledgeRow(db, id)))
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

router.post(
  '/:id/topup',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(pledgeTopupInputSchema, { ...req.body, pledgeId: id }) as PledgeTopupInput
    const db = getDatabase()
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
    res.status(201).json(mapPledge(db, getPledgeRow(db, id)))
  }),
)

export default router
