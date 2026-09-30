CREATE TABLE IF NOT EXISTS item_stock_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_date TEXT NOT NULL,
  metal TEXT NOT NULL,
  item_name TEXT NOT NULL,
  opening_weight REAL NOT NULL DEFAULT 0,
  sales_override REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(stock_date, metal, item_name)
);

CREATE INDEX IF NOT EXISTS idx_item_stock_days_lookup ON item_stock_days(stock_date, metal);
