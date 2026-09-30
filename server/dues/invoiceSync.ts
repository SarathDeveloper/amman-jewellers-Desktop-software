import { resolveAmountPayable } from '@shared/billing/billSummary'
import type Database from 'better-sqlite3'

type FinalInvoiceRow = {
  id: number
  customer_id: number
  invoice_date: string
  invoice_no: string
  total: number
  amount_paid: number
  balance_due: number
  amount_payable: number
  status: string
  is_estimate: number
}

export function syncDueEntryForFinalInvoice(db: Database.Database, invoiceId: number): void {
  const invoice = db
    .prepare(
      `SELECT id, customer_id, invoice_date, invoice_no, total, amount_paid, balance_due,
              COALESCE(amount_payable, total) AS amount_payable, status, is_estimate
       FROM invoices WHERE id = ?`,
    )
    .get(invoiceId) as FinalInvoiceRow | undefined

  const payable = invoice ? resolveAmountPayable(invoice.amount_payable, invoice.total) : 0
  const dueAmount = invoice?.balance_due ?? payable
  if (!invoice || invoice.status !== 'final' || invoice.is_estimate === 1 || dueAmount <= 0) {
    return
  }

  const existingDue = db
    .prepare(`SELECT id FROM customer_dues WHERE invoice_id = ? AND kind = 'due'`)
    .get(invoiceId) as { id: number } | undefined

  if (existingDue) {
    return
  }

  // Due line uses amount payable so an initial partial payment can sit beside it on the ledger.
  const amountPaid = Math.max(0, invoice.amount_paid ?? 0)
  const dueLineAmount = amountPaid > 0 ? payable : dueAmount
  if (dueLineAmount <= 0) {
    return
  }

  db.prepare(
    `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, invoice_id, created_at)
     VALUES (?, ?, 'due', ?, ?, ?, datetime('now'))`,
  ).run(
    invoice.customer_id,
    invoice.invoice_date,
    dueLineAmount,
    `Bill ${invoice.invoice_no}`,
    invoiceId,
  )

  if (amountPaid > 0) {
    db.prepare(
      `INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, invoice_id, created_at)
       VALUES (?, ?, 'payment', ?, ?, ?, datetime('now'))`,
    ).run(
      invoice.customer_id,
      invoice.invoice_date,
      amountPaid,
      `Partial payment ${invoice.invoice_no}`,
      invoiceId,
    )
  }
}
