DROP INDEX IF EXISTS idx_products_sku;

CREATE TABLE products_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  metal TEXT NOT NULL DEFAULT '',
  purity TEXT NOT NULL DEFAULT '',
  gross_weight REAL NOT NULL DEFAULT 0,
  net_weight REAL NOT NULL DEFAULT 0,
  making_charges REAL NOT NULL DEFAULT 0,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  image_path TEXT NOT NULL DEFAULT ''
);

INSERT INTO products_new (
  id, name, category, metal, purity, gross_weight, net_weight, making_charges, stock_qty, updated_at, image_path
)
SELECT
  id, name, category, metal, purity, gross_weight, net_weight, making_charges, stock_qty, updated_at, image_path
FROM products;

DROP TABLE products;
ALTER TABLE products_new RENAME TO products;
