-- Phase 4 of the old gold overhaul. Old gold items that are not claimed by a
-- sale bill are gathered into a refiner batch per metal, then melted, sent and
-- settled. This lot is intentionally separate from stock_movements and the
-- Gold & Silver sheet: received fine weight is settlement only and never adds
-- to normal metal stock.

-- 1. An item belongs to at most one batch.
ALTER TABLE old_gold_purchase_items ADD COLUMN batch_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_old_gold_items_batch ON old_gold_purchase_items(batch_id);

-- 2. Refiner batch lifecycle.
CREATE TABLE IF NOT EXISTS old_gold_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_no TEXT NOT NULL UNIQUE,
  metal TEXT NOT NULL DEFAULT 'Gold',
  status TEXT NOT NULL CHECK (status IN ('open', 'melted', 'sent', 'settled', 'cancelled')) DEFAULT 'open',
  supplier_id INTEGER,
  created_date TEXT NOT NULL,
  gross_weight REAL NOT NULL DEFAULT 0,
  fine_weight_expected REAL NOT NULL DEFAULT 0,
  cost_amount REAL NOT NULL DEFAULT 0,
  melt_date TEXT,
  melted_weight REAL,
  sent_date TEXT,
  sent_weight REAL,
  settled_date TEXT,
  fine_weight_received REAL,
  fine_rate REAL,
  cash_received REAL,
  settlement_mode TEXT NOT NULL DEFAULT 'cash' CHECK (settlement_mode IN ('cash', 'bank', 'fine')),
  notes TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_old_gold_batches_status ON old_gold_batches(status);
CREATE INDEX IF NOT EXISTS idx_old_gold_batches_date ON old_gold_batches(created_date);
