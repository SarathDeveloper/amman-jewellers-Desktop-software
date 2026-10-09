-- Adagu payment ledger: one row per money movement against a pledge.
-- Replaces the single amount_collected counter with an auditable history that
-- splits every payment into interest and principal, and records discounts.
CREATE TABLE IF NOT EXISTS pledge_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pledge_id INTEGER NOT NULL REFERENCES pledges(id) ON DELETE CASCADE,
  payment_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'interest', 'part', 'redeem', 'renewal', 'transfer', 'auction', 'legacy'
  )),
  mode TEXT NOT NULL CHECK (mode IN (
    'cash', 'upi', 'card', 'bank_transfer', 'transfer', 'auction'
  )),
  amount REAL NOT NULL DEFAULT 0,
  interest_part REAL NOT NULL DEFAULT 0,
  principal_part REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pledge_payments_pledge
  ON pledge_payments(pledge_id, payment_date, id);

-- Link the money ledger (customer_dues) back to the detailed payment row.
ALTER TABLE customer_dues ADD COLUMN pledge_payment_id INTEGER
  REFERENCES pledge_payments(id) ON DELETE SET NULL;
