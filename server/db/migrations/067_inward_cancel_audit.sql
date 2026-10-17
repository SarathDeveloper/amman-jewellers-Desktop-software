-- Phase 3 of the purchase redesign: a finalized purchase can be cancelled.
-- Rebuilds `inwards` so the status CHECK accepts 'cancelled' and records who
-- cancelled it and why. Runs with foreign keys OFF (see migrations.ts) so
-- inward_items and stock_adjustments.inward_id survive the parent rebuild.
CREATE TABLE inwards_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  inward_no TEXT NOT NULL UNIQUE,
  supplier_invoice_no TEXT NOT NULL DEFAULT '',
  inward_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'final', 'cancelled')) DEFAULT 'draft',
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  gst_mode TEXT NOT NULL DEFAULT 'none',
  round_off REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'purchase',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',
  cancelled_by INTEGER,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

INSERT INTO inwards_new (
  id, supplier_id, inward_no, supplier_invoice_no, inward_date, status, subtotal, discount,
  total, notes, payment_mode, cgst, sgst, igst, gst_mode, round_off, source, created_at,
  finalized_at
)
SELECT
  id, supplier_id, inward_no, supplier_invoice_no, inward_date, status, subtotal, discount,
  total, notes, payment_mode, cgst, sgst, igst, gst_mode, round_off, source, created_at,
  finalized_at
FROM inwards;

DROP TABLE inwards;
ALTER TABLE inwards_new RENAME TO inwards;

CREATE INDEX IF NOT EXISTS idx_inwards_status ON inwards(status);
CREATE INDEX IF NOT EXISTS idx_inwards_date ON inwards(inward_date);
CREATE INDEX IF NOT EXISTS idx_inwards_source ON inwards(source);
CREATE INDEX IF NOT EXISTS idx_inwards_supplier_invoice
  ON inwards(supplier_id, supplier_invoice_no);

-- One append-only trail for every record whose changes must be reconstructable.
-- Snapshots are JSON; rows are written inside the posting transaction.
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  user_id INTEGER,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
