CREATE TABLE IF NOT EXISTS pledges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  receipt_no TEXT NOT NULL UNIQUE,
  pledge_date TEXT NOT NULL,
  assessed_value REAL NOT NULL DEFAULT 0,
  loan_amount REAL NOT NULL DEFAULT 0,
  interest_pct REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed')),
  redeemed_date TEXT,
  amount_collected REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS pledge_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pledge_id INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metal TEXT NOT NULL DEFAULT '',
  purity TEXT NOT NULL DEFAULT '',
  gross_weight REAL NOT NULL DEFAULT 0,
  net_weight REAL NOT NULL DEFAULT 0,
  pieces INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (pledge_id) REFERENCES pledges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pledges_customer ON pledges(customer_id);
CREATE INDEX IF NOT EXISTS idx_pledges_date ON pledges(pledge_date);
CREATE INDEX IF NOT EXISTS idx_pledges_status ON pledges(status);
CREATE INDEX IF NOT EXISTS idx_pledge_items_pledge ON pledge_items(pledge_id);
