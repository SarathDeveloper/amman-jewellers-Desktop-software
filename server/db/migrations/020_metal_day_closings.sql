CREATE TABLE IF NOT EXISTS metal_day_closings (
  business_date TEXT NOT NULL,
  metal TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  operator_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  closed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (business_date, metal)
);

CREATE TABLE IF NOT EXISTS metal_day_closing_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_date TEXT NOT NULL,
  metal TEXT NOT NULL,
  item_name TEXT NOT NULL,
  opening_weight REAL NOT NULL DEFAULT 0,
  inward_weight REAL NOT NULL DEFAULT 0,
  sales_weight REAL NOT NULL DEFAULT 0,
  exchange_weight REAL NOT NULL DEFAULT 0,
  closing_weight REAL NOT NULL DEFAULT 0,
  sales_override REAL,
  FOREIGN KEY (business_date, metal) REFERENCES metal_day_closings(business_date, metal) ON DELETE CASCADE,
  UNIQUE (business_date, metal, item_name)
);

CREATE INDEX IF NOT EXISTS idx_metal_day_closings_status
  ON metal_day_closings(status, business_date);
CREATE INDEX IF NOT EXISTS idx_metal_day_closing_lines_date_metal
  ON metal_day_closing_lines(business_date, metal);
