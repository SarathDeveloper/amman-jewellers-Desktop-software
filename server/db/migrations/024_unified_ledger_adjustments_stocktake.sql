CREATE TABLE stock_movements_new (
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
    'transfer_in',
    'exchange_in',
    'stocktake_adjustment'
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

INSERT INTO stock_movements_new (
  id, movement_date, movement_type, product_id, qty_delta, weight_delta,
  metal, category, transfer_group, reference_type, reference_id, operator_id,
  reason, note, created_at
)
SELECT
  id, movement_date, movement_type, product_id, qty_delta, weight_delta,
  metal, category, transfer_group, reference_type, reference_id, operator_id,
  reason, note, created_at
FROM stock_movements;

DROP TABLE stock_movements;
ALTER TABLE stock_movements_new RENAME TO stock_movements;

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date
  ON stock_movements(product_id, movement_date, id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_metal_cat_date
  ON stock_movements(metal, category, movement_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref
  ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type_date
  ON stock_movements(movement_type, movement_date);

INSERT INTO stock_movements (
  movement_date, movement_type, product_id, qty_delta, weight_delta,
  metal, category, reference_type, reference_id, reason, note
)
SELECT
  i.invoice_date,
  'sale',
  ii.product_id,
  -ii.qty,
  -(ii.net_weight * ii.qty),
  ii.metal,
  ii.category,
  'invoice',
  i.id,
  'Backfill from finalized invoice',
  ''
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
WHERE i.status = 'final'
  AND i.is_estimate = 0
  AND i.is_historical = 0
  AND COALESCE(ii.line_kind, 'sale') = 'sale'
  AND ii.product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements sm
    WHERE sm.reference_type = 'invoice'
      AND sm.reference_id = i.id
      AND sm.product_id = ii.product_id
      AND sm.movement_type = 'sale'
      AND sm.movement_date = i.invoice_date
  );

INSERT INTO stock_movements (
  movement_date, movement_type, product_id, qty_delta, weight_delta,
  metal, category, reference_type, reference_id, reason, note
)
SELECT
  i.invoice_date,
  'exchange_in',
  NULL,
  0,
  (ii.net_weight * ii.qty),
  ii.metal,
  COALESCE(NULLIF(ii.category, ''), 'Exchange'),
  'invoice',
  i.id,
  'Backfill old-gold exchange',
  ''
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
WHERE i.status = 'final'
  AND i.is_estimate = 0
  AND i.is_historical = 0
  AND ii.line_kind = 'exchange'
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements sm
    WHERE sm.reference_type = 'invoice'
      AND sm.reference_id = i.id
      AND sm.movement_type = 'exchange_in'
      AND sm.movement_date = i.invoice_date
  );

INSERT INTO stock_movements (
  movement_date, movement_type, product_id, qty_delta, weight_delta,
  metal, category, reference_type, reference_id, reason, note
)
SELECT
  i.inward_date,
  'purchase',
  ii.product_id,
  ii.qty,
  (ii.net_weight * ii.qty),
  ii.metal,
  ii.category,
  'inward',
  i.id,
  'Backfill from finalized inward',
  ''
FROM inward_items ii
JOIN inwards i ON i.id = ii.inward_id
WHERE i.status = 'final'
  AND ii.product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements sm
    WHERE sm.reference_type = 'inward'
      AND sm.reference_id = i.id
      AND sm.product_id = ii.product_id
      AND sm.movement_type = 'purchase'
      AND sm.movement_date = i.inward_date
  );

INSERT INTO stock_movements (
  movement_date, movement_type, product_id, qty_delta, weight_delta,
  metal, category, reference_type, reference_id, reason, note
)
SELECT
  i.inward_date,
  'purchase',
  NULL,
  0,
  (ii.net_weight * ii.qty),
  ii.metal,
  ii.category,
  'inward',
  i.id,
  'Backfill raw metal inward',
  ''
FROM inward_items ii
JOIN inwards i ON i.id = ii.inward_id
WHERE i.status = 'final'
  AND ii.product_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements sm
    WHERE sm.reference_type = 'inward'
      AND sm.reference_id = i.id
      AND sm.movement_type = 'purchase'
      AND sm.product_id IS NULL
      AND sm.movement_date = i.inward_date
      AND lower(trim(sm.metal)) = lower(trim(ii.metal))
      AND lower(trim(sm.category)) = lower(trim(ii.category))
  );

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adjustment_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  operator_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_date ON stock_adjustments(adjustment_date);

CREATE TABLE IF NOT EXISTS stock_adjustment_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adjustment_id INTEGER NOT NULL,
  product_id INTEGER,
  metal TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  qty_delta INTEGER NOT NULL DEFAULT 0,
  weight_delta REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (adjustment_id) REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustment_lines_adjustment
  ON stock_adjustment_lines(adjustment_id);

CREATE TABLE IF NOT EXISTS stocktakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_date TEXT NOT NULL,
  metal TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'posted')) DEFAULT 'open',
  operator_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_stocktakes_date_metal ON stocktakes(business_date, metal);
CREATE INDEX IF NOT EXISTS idx_stocktakes_status ON stocktakes(status);

CREATE TABLE IF NOT EXISTS stocktake_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stocktake_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  counted_weight REAL,
  ledger_weight REAL NOT NULL DEFAULT 0,
  variance REAL NOT NULL DEFAULT 0,
  product_id INTEGER,
  counted_qty INTEGER,
  ledger_qty INTEGER NOT NULL DEFAULT 0,
  qty_variance INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (stocktake_id) REFERENCES stocktakes(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stocktake_lines_stocktake
  ON stocktake_lines(stocktake_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_lines_stocktake_product
  ON stocktake_lines(stocktake_id, product_id);
