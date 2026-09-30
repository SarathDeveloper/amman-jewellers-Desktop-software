import { Router } from 'express'
import {
  dueEntryInputSchema,
  dueEntryUpdateInputSchema,
  duePaymentInputSchema,
} from '@shared/schemas'
import {
  isInterestPeriodDue,
  nextInterestDueDate,
} from '@shared/billing/pledgeMath'
import { resolveAmountPayable } from '@shared/billing/billSummary'
import { roundMoney } from '@shared/billing/pricing'
import { localTodayIso } from '@shared/localDate'
import type {
  AdaguDueSummary,
  CustomerDuesColumn,
  DueEntry,
  DueEntryInput,
  DueEntryKind,
  DueEntryUpdateInput,
  DueInvoiceItemSummary,
  DuePaymentInput,
  DuesLedger,
  PledgeStatus,
} from '@shared/types'
import type Database from 'better-sqlite3'
import { getDatabase } from '../db'
import { refreshActivePledgeDues } from '../dues/pledgeSync'
import { asyncHandler, parseBody, parseIdParam } from '../lib/http'
import { computePledgeDueWithLoadedTopups } from '../pledges/topups'

const router = Router()

type DueEntryRow = {
  id: number
  customer_id: number
  entry_date: string
  kind: DueEntryKind
  amount: number
  note: string
  invoice_id: number | null
  invoice_no: string | null
  invoice_total: number | null
  amount_paid: number | null
  balance_due: number | null
  pledge_id: number | null
  pledge_receipt_no: string | null
  pledge_loan_amount: number | null
  pledge_interest_pct: number | null
  pledge_date: string | null
  pledge_amount_collected: number | null
  pledge_status: string | null
  pledge_redeemed_date: string | null
  created_at: string
}

type CustomerRow = {
  id: number
  name: string
  phone: string
}

type InvoiceItemRow = {
  product_name: string
  net_weight: number
  line_total: number
}

function mapItems(rows: InvoiceItemRow[]): DueInvoiceItemSummary[] {
  return rows.map((row) => ({
    productName: row.product_name || 'Old gold exchange',
    netWeight: row.net_weight,
    lineTotal: row.line_total,
  }))
}

function pledgeRemainingFromRow(db: Database.Database, row: DueEntryRow): number | null {
  if (row.pledge_id === null || row.pledge_loan_amount == null || row.pledge_date == null) {
    return null
  }
  const asOf =
    row.pledge_status === 'active'
      ? localTodayIso()
      : row.pledge_redeemed_date || localTodayIso()
  const { due } = computePledgeDueWithLoadedTopups(
    db,
    {
      id: row.pledge_id,
      loan_amount: row.pledge_loan_amount,
      interest_pct: row.pledge_interest_pct ?? 0,
      pledge_date: row.pledge_date,
      amount_collected: row.pledge_amount_collected ?? 0,
    },
    asOf,
  )
  return due.remaining
}

function mapDueEntry(
  db: Database.Database,
  row: DueEntryRow,
  items: DueInvoiceItemSummary[] = [],
): DueEntry {
  const pledgeRemaining = pledgeRemainingFromRow(db, row)
  return {
    id: row.id,
    customerId: row.customer_id,
    entryDate: row.entry_date,
    kind: row.kind,
    amount: row.amount,
    note: row.note,
    invoiceId: row.invoice_id,
    invoiceNo: row.invoice_no,
    pledgeId: row.pledge_id,
    pledgeReceiptNo: row.pledge_receipt_no,
    createdAt: row.created_at,
    invoiceTotal: row.invoice_total,
    amountPaid: row.amount_paid ?? (row.pledge_id !== null ? row.pledge_amount_collected : null),
    balanceDue: row.balance_due ?? pledgeRemaining,
    items,
  }
}

function emptyDueEntryStub(
  customerId: number,
  kind: DueEntryKind,
  amount: number,
): DueEntry {
  return {
    id: 0,
    customerId,
    entryDate: '',
    kind,
    amount,
    note: '',
    invoiceId: null,
    invoiceNo: null,
    pledgeId: null,
    pledgeReceiptNo: null,
    createdAt: '',
    invoiceTotal: null,
    amountPaid: null,
    balanceDue: null,
    items: [],
  }
}

function balanceForEntries(entries: DueEntry[]): number {
  let balance = 0
  for (const entry of entries) {
    if (entry.kind === 'due') {
      balance += entry.amount
    } else {
      balance -= entry.amount
    }
  }
  return balance
}

const entrySelectSql = `
  SELECT d.*,
         i.invoice_no,
         i.total AS invoice_total,
         i.amount_paid,
         i.balance_due,
         p.receipt_no AS pledge_receipt_no,
         p.loan_amount AS pledge_loan_amount,
         p.interest_pct AS pledge_interest_pct,
         p.pledge_date AS pledge_date,
         p.amount_collected AS pledge_amount_collected,
         p.status AS pledge_status,
         p.redeemed_date AS pledge_redeemed_date
  FROM customer_dues d
  LEFT JOIN invoices i ON i.id = d.invoice_id
  LEFT JOIN pledges p ON p.id = d.pledge_id
`

function loadItemsForInvoice(db: Database.Database, invoiceId: number | null): DueInvoiceItemSummary[] {
  if (invoiceId === null) {
    return []
  }
  const rows = db
    .prepare(
      `SELECT p.name AS product_name, ii.net_weight, ii.line_total
       FROM invoice_items ii
       LEFT JOIN products p ON p.id = ii.product_id
       WHERE ii.invoice_id = ?
       ORDER BY ii.id ASC`,
    )
    .all(invoiceId) as InvoiceItemRow[]
  return mapItems(rows)
}

function loadDueEntry(db: Database.Database, id: number): DueEntry {
  const row = db.prepare(`${entrySelectSql} WHERE d.id = ?`).get(id) as DueEntryRow | undefined
  if (!row) {
    throw new Error('Due entry not found')
  }
  return mapDueEntry(db, row, loadItemsForInvoice(db, row.invoice_id))
}

function remainingForDue(db: Database.Database, entry: DueEntry): number {
  if (entry.kind !== 'due') {
    throw new Error('Payments can only be recorded against a due entry')
  }

  if (entry.invoiceId !== null) {
    const invoice = db
      .prepare('SELECT balance_due FROM invoices WHERE id = ?')
      .get(entry.invoiceId) as { balance_due: number } | undefined
    if (!invoice) {
      throw new Error('Invoice not found')
    }
    return Math.max(0, invoice.balance_due)
  }

  if (entry.pledgeId !== null) {
    const pledge = db
      .prepare(
        `SELECT id, loan_amount, interest_pct, pledge_date, amount_collected, status, redeemed_date
         FROM pledges WHERE id = ?`,
      )
      .get(entry.pledgeId) as
      | {
          id: number
          loan_amount: number
          interest_pct: number
          pledge_date: string
          amount_collected: number
          status: string
          redeemed_date: string | null
        }
      | undefined
    if (!pledge) {
      throw new Error('Pledge not found')
    }
    const asOf = pledge.status === 'active' ? localTodayIso() : pledge.redeemed_date || localTodayIso()
    const { due } = computePledgeDueWithLoadedTopups(db, pledge, asOf)
    return due.remaining
  }

  const rows = db
    .prepare(
      `SELECT kind, amount FROM customer_dues
       WHERE customer_id = ?
       ORDER BY entry_date ASC, id ASC`,
    )
    .all(entry.customerId) as Array<{ kind: DueEntryKind; amount: number }>

  const columnBalance = balanceForEntries(
    rows.map((row) => emptyDueEntryStub(entry.customerId, row.kind, row.amount)),
  )

  return Math.max(0, Math.min(entry.amount, columnBalance))
}

type PledgeListRow = {
  id: number
  customer_id: number
  receipt_no: string
  pledge_date: string
  loan_amount: number
  interest_pct: number
  amount_collected: number
  status: PledgeStatus
  redeemed_date: string | null
  customer_name: string
  customer_phone: string
}

function buildAdaguDues(
  db: Database.Database,
  term: string,
): { adaguDues: AdaguDueSummary[]; adaguOutstanding: number } {
  const today = localTodayIso()
  const pledges = db
    .prepare(
      `SELECT p.id, p.customer_id, p.receipt_no, p.pledge_date, p.loan_amount, p.interest_pct,
              p.amount_collected, p.status, p.redeemed_date,
              c.name AS customer_name, c.phone AS customer_phone
       FROM pledges p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.status IN ('active', 'redeemed', 'forfeited')
       ORDER BY p.pledge_date DESC, p.id DESC`,
    )
    .all() as PledgeListRow[]

  const dueIdStmt = db.prepare(
    `SELECT id FROM customer_dues WHERE pledge_id = ? AND kind = 'due'`,
  )

  const adaguDues: AdaguDueSummary[] = []
  let adaguOutstanding = 0

  for (const pledge of pledges) {
    if (term) {
      const haystack = `${pledge.customer_name} ${pledge.customer_phone} ${pledge.receipt_no}`.toLowerCase()
      if (!haystack.includes(term)) continue
    }
    const asOf = pledge.status === 'active' ? today : pledge.redeemed_date || today
    const { due, topups } = computePledgeDueWithLoadedTopups(db, pledge, asOf)
    const dueRow = dueIdStmt.get(pledge.id) as { id: number } | undefined
    const remaining = pledge.status === 'forfeited' ? 0 : due.remaining
    adaguOutstanding += remaining
    adaguDues.push({
      pledgeId: pledge.id,
      dueEntryId: dueRow?.id ?? null,
      customerId: pledge.customer_id,
      customerName: pledge.customer_name,
      customerPhone: pledge.customer_phone,
      receiptNo: pledge.receipt_no,
      pledgeDate: pledge.pledge_date,
      principal: due.principal,
      interestPct: pledge.interest_pct,
      monthlyInterest: due.monthlyInterest,
      daysActive: due.days,
      nextInterestDue: nextInterestDueDate(pledge.pledge_date, asOf),
      isInterestOverdue:
        pledge.status === 'active' && remaining > 0 && isInterestPeriodDue(pledge.pledge_date, asOf),
      totalDue: due.totalDue,
      amountCollected: pledge.amount_collected,
      remaining,
      status: pledge.status,
      topups,
    })
  }

  return { adaguDues, adaguOutstanding }
}

export function insertPayment(
  db: Database.Database,
  input: {
    customerId: number
    entryDate: string
    amount: number
    note: string
    invoiceId: number | null
    pledgeId: number | null
  },
): DueEntry {
  const result = db
    .prepare(
      `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, invoice_id, pledge_id, created_at)
       VALUES (?, ?, 'payment', ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      input.customerId,
      input.entryDate,
      input.amount,
      input.note,
      input.invoiceId,
      input.pledgeId,
    )

  if (input.invoiceId !== null) {
    const invoice = db
      .prepare(
        `SELECT total, amount_paid, COALESCE(amount_payable, total) AS amount_payable
         FROM invoices WHERE id = ?`,
      )
      .get(input.invoiceId) as
      | { total: number; amount_paid: number; amount_payable: number }
      | undefined
    if (!invoice) {
      throw new Error('Invoice not found')
    }
    const payable = resolveAmountPayable(invoice.amount_payable, invoice.total)
    const amountPaid = invoice.amount_paid + input.amount
    if (amountPaid - payable > 0.009) {
      throw new Error('Payment cannot exceed the balance due')
    }
    const balanceDue = Math.max(0, payable - amountPaid)
    db.prepare('UPDATE invoices SET amount_paid = ?, balance_due = ? WHERE id = ?').run(
      amountPaid,
      balanceDue,
      input.invoiceId,
    )
  }

  if (input.pledgeId !== null) {
    applyPledgeCollection(db, input.pledgeId, input.amount, input.entryDate)
  }

  return loadDueEntry(db, Number(result.lastInsertRowid))
}

function applyPledgeCollection(
  db: Database.Database,
  pledgeId: number,
  amount: number,
  collectedDate: string,
): void {
  const pledge = db
    .prepare(
      `SELECT id, loan_amount, interest_pct, pledge_date, amount_collected, status
       FROM pledges WHERE id = ?`,
    )
    .get(pledgeId) as
    | {
        id: number
        loan_amount: number
        interest_pct: number
        pledge_date: string
        amount_collected: number
        status: string
      }
    | undefined
  if (!pledge) {
    throw new Error('Pledge not found')
  }
  if (pledge.status !== 'active') {
    throw new Error('Only active Adagu pledges can receive payments')
  }

  const { due } = computePledgeDueWithLoadedTopups(db, pledge, collectedDate)
  const nextCollected = roundMoney(pledge.amount_collected + amount)
  if (nextCollected >= due.totalDue) {
    db.prepare(
      `UPDATE pledges SET
        status = 'redeemed',
        redeemed_date = ?,
        amount_collected = ?
       WHERE id = ?`,
    ).run(collectedDate, nextCollected, pledgeId)
  } else {
    db.prepare(`UPDATE pledges SET amount_collected = ? WHERE id = ?`).run(nextCollected, pledgeId)
  }
}

function syncInvoicePaidFromPayments(db: Database.Database, invoiceId: number): void {
  const invoice = db
    .prepare(`SELECT total, COALESCE(amount_payable, total) AS amount_payable FROM invoices WHERE id = ?`)
    .get(invoiceId) as { total: number; amount_payable: number } | undefined
  if (!invoice) {
    throw new Error('Invoice not found')
  }
  const paidRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS paid
       FROM customer_dues
       WHERE invoice_id = ? AND kind = 'payment'`,
    )
    .get(invoiceId) as { paid: number }
  const amountPaid = paidRow.paid
  const payable = resolveAmountPayable(invoice.amount_payable, invoice.total)
  const balanceDue = Math.max(0, payable - amountPaid)
  db.prepare('UPDATE invoices SET amount_paid = ?, balance_due = ? WHERE id = ?').run(
    amountPaid,
    balanceDue,
    invoiceId,
  )
}

function syncPledgePaidFromPayments(db: Database.Database, pledgeId: number): void {
  const pledge = db
    .prepare(
      `SELECT id, loan_amount, interest_pct, pledge_date, status, redeemed_date
       FROM pledges WHERE id = ?`,
    )
    .get(pledgeId) as
    | {
        id: number
        loan_amount: number
        interest_pct: number
        pledge_date: string
        status: string
        redeemed_date: string | null
      }
    | undefined
  if (!pledge) {
    throw new Error('Pledge not found')
  }

  const paidRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS paid
       FROM customer_dues
       WHERE pledge_id = ? AND kind = 'payment'`,
    )
    .get(pledgeId) as { paid: number }
  const amountCollected = paidRow.paid
  const asOf = pledge.status === 'active' ? localTodayIso() : pledge.redeemed_date || localTodayIso()
  const { due } = computePledgeDueWithLoadedTopups(
    db,
    { ...pledge, amount_collected: 0 },
    asOf,
  )

  if (amountCollected >= due.totalDue && due.totalDue > 0) {
    db.prepare(
      `UPDATE pledges SET
        status = 'redeemed',
        redeemed_date = COALESCE(redeemed_date, ?),
        amount_collected = ?
       WHERE id = ?`,
    ).run(localTodayIso(), amountCollected, pledgeId)
  } else {
    db.prepare(
      `UPDATE pledges SET
        status = CASE WHEN status = 'forfeited' THEN status ELSE 'active' END,
        redeemed_date = CASE WHEN status = 'forfeited' THEN redeemed_date ELSE NULL END,
        amount_collected = ?
       WHERE id = ?`,
    ).run(amountCollected, pledgeId)
  }
}

router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDatabase()
    refreshActivePledgeDues(db)

    const term = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : ''

    const customers = db
      .prepare(
        `SELECT DISTINCT c.id, c.name, c.phone
         FROM customers c
         INNER JOIN customer_dues d ON d.customer_id = c.id
         ORDER BY c.name COLLATE NOCASE`,
      )
      .all() as CustomerRow[]

    const entryStmt = db.prepare(
      `${entrySelectSql}
       WHERE d.customer_id = ?
       ORDER BY d.entry_date ASC, d.id ASC`,
    )

    const columns: CustomerDuesColumn[] = []
    let totalOutstanding = 0

    for (const customer of customers) {
      if (term) {
        const haystack = `${customer.name} ${customer.phone}`.toLowerCase()
        if (!haystack.includes(term)) {
          continue
        }
      }

      const rows = entryStmt.all(customer.id) as DueEntryRow[]
      const entries = rows.map((row) => mapDueEntry(db, row, loadItemsForInvoice(db, row.invoice_id)))
      const balance = balanceForEntries(entries)
      totalOutstanding += balance

      columns.push({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        balance,
        entries,
      })
    }

    const { adaguDues, adaguOutstanding } = buildAdaguDues(db, term)
    const ledger: DuesLedger = { columns, totalOutstanding, adaguDues, adaguOutstanding }
    res.json(ledger)
  }),
)

router.post(
  '/',
  asyncHandler((req, res) => {
    const input = parseBody(dueEntryInputSchema, req.body) as DueEntryInput
    const db = getDatabase()
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(input.customerId)
    if (!customer) {
      throw new Error('Customer not found')
    }

    const result = db
      .prepare(
        `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(input.customerId, input.entryDate, input.kind, input.amount, input.note)

    res.status(201).json(loadDueEntry(db, Number(result.lastInsertRowid)))
  }),
)

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(dueEntryUpdateInputSchema, { ...req.body, id }) as DueEntryUpdateInput
    const db = getDatabase()
    const existing = db
      .prepare('SELECT id, invoice_id, pledge_id FROM customer_dues WHERE id = ?')
      .get(input.id) as { id: number; invoice_id: number | null; pledge_id: number | null } | undefined

    if (!existing) {
      throw new Error('Due entry not found')
    }
    if (existing.invoice_id !== null) {
      throw new Error('Bill-linked entries cannot be edited')
    }
    if (existing.pledge_id !== null) {
      throw new Error('Adagu-linked entries cannot be edited')
    }

    db.prepare(
      `UPDATE customer_dues
       SET entry_date = ?, kind = ?, amount = ?, note = ?
       WHERE id = ?`,
    ).run(input.entryDate, input.kind, input.amount, input.note, input.id)

    res.json(loadDueEntry(db, input.id))
  }),
)

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const existing = db
      .prepare('SELECT id, invoice_id, pledge_id, kind FROM customer_dues WHERE id = ?')
      .get(id) as {
      id: number
      invoice_id: number | null
      pledge_id: number | null
      kind: DueEntryKind
    } | undefined

    if (!existing) {
      throw new Error('Due entry not found')
    }
    if (existing.invoice_id !== null && existing.kind === 'due') {
      throw new Error('Bill-linked due entries cannot be deleted')
    }
    if (existing.pledge_id !== null && existing.kind === 'due') {
      throw new Error('Adagu-linked due entries cannot be deleted')
    }

    const invoiceId = existing.invoice_id
    const pledgeId = existing.pledge_id
    const linkedInvoicePayment = invoiceId !== null && existing.kind === 'payment'
    const linkedPledgePayment = pledgeId !== null && existing.kind === 'payment'

    const tx = db.transaction(() => {
      const result = db.prepare('DELETE FROM customer_dues WHERE id = ?').run(id)
      if (result.changes === 0) {
        throw new Error('Due entry not found')
      }
      if (linkedInvoicePayment) {
        syncInvoicePaidFromPayments(db, invoiceId)
      }
      if (linkedPledgePayment) {
        syncPledgePaidFromPayments(db, pledgeId)
      }
    })
    tx()
    res.status(204).end()
  }),
)

router.post(
  '/:id/payment',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const input = parseBody(duePaymentInputSchema, { ...req.body, dueEntryId: id }) as DuePaymentInput
    const db = getDatabase()
    const due = loadDueEntry(db, input.dueEntryId)
    const remaining = remainingForDue(db, due)

    if (remaining <= 0) {
      throw new Error('This due is already settled')
    }
    if (input.amount > remaining + 1e-9) {
      throw new Error(`Payment exceeds remaining balance of ${remaining}`)
    }

    const label = due.invoiceNo
      ? `Payment for ${due.invoiceNo}`
      : due.pledgeReceiptNo
        ? `Payment for ${due.pledgeReceiptNo}`
        : 'Payment'

    res.json(
      insertPayment(db, {
        customerId: due.customerId,
        entryDate: input.entryDate,
        amount: input.amount,
        note: input.note || label,
        invoiceId: due.invoiceId,
        pledgeId: due.pledgeId,
      }),
    )
  }),
)

router.post(
  '/:id/mark-paid',
  asyncHandler((req, res) => {
    const id = parseIdParam(req.params.id)
    const db = getDatabase()
    const due = loadDueEntry(db, id)
    const remaining = remainingForDue(db, due)

    if (remaining <= 0) {
      throw new Error('This due is already settled')
    }

    const entryDate = localTodayIso()
    const label = due.invoiceNo
      ? `Settled ${due.invoiceNo}`
      : due.pledgeReceiptNo
        ? `Settled ${due.pledgeReceiptNo}`
        : 'Settled'

    res.json(
      insertPayment(db, {
        customerId: due.customerId,
        entryDate,
        amount: remaining,
        note: label,
        invoiceId: due.invoiceId,
        pledgeId: due.pledgeId,
      }),
    )
  }),
)

export default router
