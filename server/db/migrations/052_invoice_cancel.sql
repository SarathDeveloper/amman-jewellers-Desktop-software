-- Phase 5: cancelling a whole bill. Rebuilds `invoices` so the status CHECK
-- accepts 'cancelled' and records who cancelled it and why. Runs with foreign
-- keys OFF (see migrations.ts) so invoice_items, invoice_old_gold,
-- invoice_old_gold_links and invoice_gold_saving_links are not cascade-deleted
-- when the parent rows are dropped and re-inserted.
CREATE TABLE invoices_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  invoice_no TEXT NOT NULL UNIQUE,
  invoice_date TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft', 'final', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  bill_format TEXT NOT NULL DEFAULT 'cash_bill',
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  amount_paid REAL NOT NULL DEFAULT 0,
  balance_due REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  is_estimate INTEGER NOT NULL DEFAULT 0,
  is_historical INTEGER NOT NULL DEFAULT 0,
  summary_gold_g REAL NOT NULL DEFAULT 0,
  summary_silver_g REAL NOT NULL DEFAULT 0,
  summary_making REAL NOT NULL DEFAULT 0,
  round_off REAL NOT NULL DEFAULT 0,
  amount_payable REAL NOT NULL DEFAULT 0,
  customer_name_snap TEXT NOT NULL DEFAULT '',
  customer_phone_snap TEXT NOT NULL DEFAULT '',
  customer_address_snap TEXT NOT NULL DEFAULT '',
  customer_gstin_snap TEXT NOT NULL DEFAULT '',
  rates_snapshot TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',
  cancelled_by INTEGER,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

INSERT INTO invoices_new (
  id, customer_id, invoice_no, invoice_date, subtotal, tax, total, status, created_at,
  bill_format, payment_mode, amount_paid, balance_due, discount, cgst, sgst, igst,
  is_estimate, is_historical, summary_gold_g, summary_silver_g, summary_making,
  round_off, amount_payable, customer_name_snap, customer_phone_snap,
  customer_address_snap, customer_gstin_snap, rates_snapshot
)
SELECT
  id, customer_id, invoice_no, invoice_date, subtotal, tax, total, status, created_at,
  bill_format, payment_mode, amount_paid, balance_due, discount, cgst, sgst, igst,
  is_estimate, is_historical, summary_gold_g, summary_silver_g, summary_making,
  round_off, amount_payable, customer_name_snap, customer_phone_snap,
  customer_address_snap, customer_gstin_snap, rates_snapshot
FROM invoices;

DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
