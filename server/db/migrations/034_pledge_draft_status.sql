-- Allow unsanctioned Adagu drafts. Existing pledges stay active.
CREATE TABLE pledges_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  receipt_no TEXT NOT NULL UNIQUE,
  pledge_date TEXT NOT NULL,
  pledge_type TEXT NOT NULL DEFAULT 'GOLD JEWELLERY',
  guardian_name TEXT NOT NULL DEFAULT '',
  customer_address TEXT NOT NULL DEFAULT '',
  assessed_value REAL NOT NULL DEFAULT 0,
  loan_amount REAL NOT NULL DEFAULT 0,
  charges REAL NOT NULL DEFAULT 0,
  interest_pct REAL NOT NULL DEFAULT 0,
  repayment_due_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'redeemed', 'forfeited')),
  redeemed_date TEXT,
  amount_collected REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

INSERT INTO pledges_new (
  id, customer_id, receipt_no, pledge_date, pledge_type, guardian_name, customer_address,
  assessed_value, loan_amount, charges, interest_pct, repayment_due_date, status,
  redeemed_date, amount_collected, notes, created_at
)
SELECT
  id, customer_id, receipt_no, pledge_date, pledge_type, guardian_name, customer_address,
  assessed_value, loan_amount, charges, interest_pct, repayment_due_date, status,
  redeemed_date, amount_collected, notes, created_at
FROM pledges;

DROP TABLE pledges;
ALTER TABLE pledges_new RENAME TO pledges;
CREATE INDEX IF NOT EXISTS idx_pledges_customer ON pledges(customer_id);
CREATE INDEX IF NOT EXISTS idx_pledges_date ON pledges(pledge_date);
CREATE INDEX IF NOT EXISTS idx_pledges_status ON pledges(status);
