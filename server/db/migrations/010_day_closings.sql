CREATE TABLE IF NOT EXISTS day_closings (
  business_date TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  opening_cash REAL NOT NULL DEFAULT 0,
  cash_sales REAL NOT NULL DEFAULT 0,
  upi_sales REAL NOT NULL DEFAULT 0,
  card_sales REAL NOT NULL DEFAULT 0,
  mixed_sales REAL NOT NULL DEFAULT 0,
  due_collection REAL NOT NULL DEFAULT 0,
  expected_cash REAL NOT NULL DEFAULT 0,
  actual_cash REAL,
  difference REAL,
  operator_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  closed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_day_closings_status ON day_closings(status, business_date);
