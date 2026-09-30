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
  operator_id INTEGER,
  reason TEXT NOT NULL DEFAULT '',
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
  note,
  reason
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
  'Opening snapshot at sync hardening',
  'Opening snapshot at sync hardening'
FROM products
WHERE stock_qty > 0
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements sm
    WHERE sm.product_id = products.id AND sm.movement_type = 'opening'
  );

ALTER TABLE item_stock_days ADD COLUMN override_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE item_stock_days ADD COLUMN override_reference_id INTEGER;

ALTER TABLE metal_day_closings ADD COLUMN reopen_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE metal_day_closings ADD COLUMN reopened_by TEXT NOT NULL DEFAULT '';
ALTER TABLE metal_day_closings ADD COLUMN reopened_at TEXT;
