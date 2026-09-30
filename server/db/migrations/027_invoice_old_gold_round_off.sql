CREATE TABLE IF NOT EXISTS invoice_old_gold (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  gross_weight REAL NOT NULL DEFAULT 0,
  stone_weight REAL NOT NULL DEFAULT 0,
  net_weight REAL NOT NULL DEFAULT 0,
  purity TEXT NOT NULL DEFAULT '',
  rate_per_gram REAL NOT NULL DEFAULT 0,
  deduction_pct REAL NOT NULL DEFAULT 0,
  gross_value REAL NOT NULL DEFAULT 0,
  deduction_amount REAL NOT NULL DEFAULT 0,
  final_value REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoice_old_gold_invoice
  ON invoice_old_gold(invoice_id);

ALTER TABLE invoices ADD COLUMN round_off REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN amount_payable REAL NOT NULL DEFAULT 0;

UPDATE invoices SET amount_payable = total WHERE amount_payable = 0;
