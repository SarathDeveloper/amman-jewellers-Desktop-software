CREATE TABLE IF NOT EXISTS old_gold_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_no TEXT NOT NULL UNIQUE,
  purchase_date TEXT NOT NULL,
  customer_id INTEGER,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  total_amount REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'final')) DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS old_gold_purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
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
  FOREIGN KEY (purchase_id) REFERENCES old_gold_purchases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoice_old_gold_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  purchase_id INTEGER NOT NULL,
  amount_applied REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_id) REFERENCES old_gold_purchases(id),
  UNIQUE (invoice_id, purchase_id),
  UNIQUE (purchase_id)
);

CREATE INDEX IF NOT EXISTS idx_old_gold_purchases_status ON old_gold_purchases(status);
CREATE INDEX IF NOT EXISTS idx_old_gold_purchases_date ON old_gold_purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_old_gold_purchases_no ON old_gold_purchases(purchase_no);
CREATE INDEX IF NOT EXISTS idx_old_gold_purchase_items_purchase ON old_gold_purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_invoice_old_gold_links_invoice ON invoice_old_gold_links(invoice_id);
