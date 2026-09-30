ALTER TABLE products ADD COLUMN parent_id INTEGER REFERENCES products(id);
ALTER TABLE products ADD COLUMN variant_code TEXT;
ALTER TABLE products ADD COLUMN size TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN stone_weight REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN stone_details TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN attributes TEXT NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_products_parent ON products(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_variant_code
  ON products(variant_code)
  WHERE variant_code IS NOT NULL;
