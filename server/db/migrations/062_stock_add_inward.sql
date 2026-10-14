ALTER TABLE suppliers ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;

INSERT INTO suppliers (name, phone, address, notes, gstin, is_system, created_at)
SELECT 'Stock addition', '', '', 'System supplier for Adjust Stock Quantity additions', '', 1, datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers WHERE COALESCE(is_system, 0) = 1 AND name = 'Stock addition'
);

ALTER TABLE inwards ADD COLUMN source TEXT NOT NULL DEFAULT 'purchase'
  CHECK (source IN ('purchase', 'stock_add'));

ALTER TABLE stock_adjustments ADD COLUMN inward_id INTEGER REFERENCES inwards(id);

CREATE INDEX IF NOT EXISTS idx_inwards_source ON inwards(source);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_inward ON stock_adjustments(inward_id);
