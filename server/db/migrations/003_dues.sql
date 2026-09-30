CREATE TABLE IF NOT EXISTS customer_dues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  entry_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('due', 'payment')),
  amount REAL NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_customer_dues_customer ON customer_dues(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_dues_date ON customer_dues(entry_date);
