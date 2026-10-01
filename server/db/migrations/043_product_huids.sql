CREATE TABLE IF NOT EXISTS product_huids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  huid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_huids_product ON product_huids(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_huids_value ON product_huids(huid);
