-- Apply a gold savings scheme balance as a credit on a sale bill.
-- The draft stores the link; finalize creates the redemption in the same
-- transaction and records the redemption id here.
CREATE TABLE IF NOT EXISTS invoice_gold_saving_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  gold_weight REAL NOT NULL DEFAULT 0,
  bonus_gold_weight REAL NOT NULL DEFAULT 0,
  gold_rate REAL NOT NULL DEFAULT 0,
  amount_applied REAL NOT NULL DEFAULT 0,
  redemption_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (invoice_id, account_id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES gold_saving_accounts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_invoice_gs_links_account
  ON invoice_gold_saving_links(account_id);
