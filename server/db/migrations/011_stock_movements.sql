CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movement_date TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'opening',
    'purchase',
    'sale',
    'sales_return',
    'purchase_return',
    'adjustment',
    'damaged',
    'lost',
    'transfer_out',
    'transfer_in'
  )),
  product_id INTEGER,
  qty_delta INTEGER NOT NULL DEFAULT 0,
  weight_delta REAL NOT NULL DEFAULT 0,
  metal TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  transfer_group TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date
  ON stock_movements(product_id, movement_date, id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_metal_cat_date
  ON stock_movements(metal, category, movement_date);

CREATE INDEX IF NOT EXISTS idx_stock_movements_ref
  ON stock_movements(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_type_date
  ON stock_movements(movement_type, movement_date);

INSERT OR IGNORE INTO shop_settings (key, value)
VALUES ('stock_ledger_start_date', date('now', 'localtime'));

INSERT INTO stock_movements (
  movement_date,
  movement_type,
  product_id,
  qty_delta,
  weight_delta,
  metal,
  category,
  reference_type,
  note
)
SELECT
  date('now', 'localtime'),
  'opening',
  id,
  stock_qty,
  stock_qty * net_weight,
  metal,
  category,
  'migration',
  'Opening stock from existing quantity'
FROM products
WHERE stock_qty > 0;
