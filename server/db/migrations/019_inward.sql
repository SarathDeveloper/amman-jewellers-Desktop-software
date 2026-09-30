CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inwards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  inward_no TEXT NOT NULL UNIQUE,
  inward_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'final')) DEFAULT 'draft',
  subtotal REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS inward_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inward_id INTEGER NOT NULL,
  product_id INTEGER,
  metal TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  purity TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL DEFAULT 1,
  net_weight REAL NOT NULL DEFAULT 0,
  rate REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (inward_id) REFERENCES inwards(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inwards_status ON inwards(status);
CREATE INDEX IF NOT EXISTS idx_inwards_date ON inwards(inward_date);
CREATE INDEX IF NOT EXISTS idx_inward_items_inward ON inward_items(inward_id);
CREATE INDEX IF NOT EXISTS idx_inward_items_metal_cat_date
  ON inward_items(metal, category);
