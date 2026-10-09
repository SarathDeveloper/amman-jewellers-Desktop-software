-- Phase 2: cancellation with a refund.
--
-- The scheme decides the default cancellation deduction; an admin can override
-- it. Every cancellation writes a refund voucher row and a 'refund' ledger entry
-- that zeroes the accumulated grams.

ALTER TABLE gold_saving_schemes ADD COLUMN cancel_deduction_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE gold_saving_schemes ADD COLUMN cancel_deduction_value REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS gold_saving_refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  voucher_no TEXT NOT NULL UNIQUE,
  refund_date TEXT NOT NULL,
  total_paid REAL NOT NULL DEFAULT 0,
  deduction REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  transaction_ref TEXT NOT NULL DEFAULT '',
  gold_forfeited REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES gold_saving_accounts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_gs_refunds_account ON gold_saving_refunds(account_id);
CREATE INDEX IF NOT EXISTS idx_gs_refunds_date ON gold_saving_refunds(refund_date);

-- SQLite cannot alter a CHECK constraint, so the ledger is rebuilt to allow the
-- 'refund' entry type. Nothing holds a foreign key to this table, and nothing
-- else in the schema references it, so a copy-and-rename is safe.
CREATE TABLE gold_saving_ledger_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('payment', 'reversal', 'bonus', 'redemption', 'correction', 'refund')),
  payment_id INTEGER,
  redemption_id INTEGER,
  amount REAL NOT NULL DEFAULT 0,
  gold_weight REAL NOT NULL DEFAULT 0,
  gold_rate REAL NOT NULL DEFAULT 0,
  cumulative_gold REAL NOT NULL DEFAULT 0,
  txn_ref TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES gold_saving_accounts(id) ON DELETE RESTRICT
);

INSERT INTO gold_saving_ledger_rebuild (
  id, account_id, entry_date, entry_type, payment_id, redemption_id,
  amount, gold_weight, gold_rate, cumulative_gold, txn_ref, notes, created_by, created_at
)
SELECT
  id, account_id, entry_date, entry_type, payment_id, redemption_id,
  amount, gold_weight, gold_rate, cumulative_gold, txn_ref, notes, created_by, created_at
FROM gold_saving_ledger;

DROP TABLE gold_saving_ledger;
ALTER TABLE gold_saving_ledger_rebuild RENAME TO gold_saving_ledger;

CREATE INDEX IF NOT EXISTS idx_gs_ledger_account ON gold_saving_ledger(account_id, id);
