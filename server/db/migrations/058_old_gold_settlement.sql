-- Phase 1 of the old gold overhaul. A finalized purchase now carries a running
-- balance that payouts and bill links draw down, and a purchase can be voided
-- when nothing claims it yet.
--
-- Runs with foreign keys OFF (see migrations.ts) so old_gold_purchase_items and
-- invoice_old_gold_links are not cascade-deleted when the parent purchase rows
-- are dropped and re-inserted.

-- 1. Allow a purchase to be cancelled, and record who/when/why.
CREATE TABLE old_gold_purchases_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_no TEXT NOT NULL UNIQUE,
  purchase_date TEXT NOT NULL,
  customer_id INTEGER,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  total_amount REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'final', 'cancelled')) DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',
  cancelled_by INTEGER,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

INSERT INTO old_gold_purchases_new (
  id, purchase_no, purchase_date, customer_id, customer_name, customer_phone,
  total_amount, notes, status, created_at, finalized_at
)
SELECT
  id, purchase_no, purchase_date, customer_id, customer_name, customer_phone,
  total_amount, notes, status, created_at, finalized_at
FROM old_gold_purchases;

DROP TABLE old_gold_purchases;
ALTER TABLE old_gold_purchases_new RENAME TO old_gold_purchases;

CREATE INDEX IF NOT EXISTS idx_old_gold_purchases_status ON old_gold_purchases(status);
CREATE INDEX IF NOT EXISTS idx_old_gold_purchases_date ON old_gold_purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_old_gold_purchases_no ON old_gold_purchases(purchase_no);

-- 2. One purchase may now be applied across several bills, so drop the
--    single-link constraint on purchase_id. Keep one row per (bill, purchase).
CREATE TABLE invoice_old_gold_links_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  purchase_id INTEGER NOT NULL,
  amount_applied REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_id) REFERENCES old_gold_purchases(id),
  UNIQUE (invoice_id, purchase_id)
);

INSERT INTO invoice_old_gold_links_new (id, invoice_id, purchase_id, amount_applied, created_at)
SELECT id, invoice_id, purchase_id, amount_applied, created_at
FROM invoice_old_gold_links;

DROP TABLE invoice_old_gold_links;
ALTER TABLE invoice_old_gold_links_new RENAME TO invoice_old_gold_links;

CREATE INDEX IF NOT EXISTS idx_invoice_old_gold_links_invoice ON invoice_old_gold_links(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_old_gold_links_purchase ON invoice_old_gold_links(purchase_id);

-- 3. Cash / UPI / bank paid out to the customer who sold the old gold.
CREATE TABLE IF NOT EXISTS old_gold_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  payout_date TEXT NOT NULL,
  amount REAL NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('cash', 'upi', 'bank')) DEFAULT 'cash',
  note TEXT NOT NULL DEFAULT '',
  invoice_id INTEGER,
  operator_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  voided_at TEXT,
  void_reason TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (purchase_id) REFERENCES old_gold_purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_old_gold_payouts_purchase ON old_gold_payouts(purchase_id);
CREATE INDEX IF NOT EXISTS idx_old_gold_payouts_date ON old_gold_payouts(payout_date);
