-- Phase 4 of the purchase redesign: optional per-product piece tracking.
-- A tracked product's `stock_qty` stays the cached count every existing reader
-- uses; inventory_pieces is the source of truth and the two are kept equal
-- inside the same transaction in server/stock/pieces.ts.
ALTER TABLE products ADD COLUMN track_pieces INTEGER NOT NULL DEFAULT 0;

CREATE TABLE inventory_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  tag_code TEXT NOT NULL UNIQUE,
  huid TEXT NOT NULL DEFAULT '',
  gross_weight REAL NOT NULL DEFAULT 0,
  stone_weight REAL NOT NULL DEFAULT 0,
  net_weight REAL NOT NULL,
  cost REAL,
  status TEXT NOT NULL CHECK (status IN ('in_stock', 'sold', 'reversed', 'damaged', 'lost')),
  inward_id INTEGER,
  inward_item_id INTEGER,
  invoice_id INTEGER,
  invoice_item_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pieces_product_status ON inventory_pieces(product_id, status);
CREATE INDEX IF NOT EXISTS idx_pieces_inward ON inventory_pieces(inward_id);
CREATE INDEX IF NOT EXISTS idx_pieces_invoice ON inventory_pieces(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pieces_huid
  ON inventory_pieces(huid) WHERE huid != '';

-- product_huids remains the global HUID uniqueness guard. A tracked piece's HUID
-- row carries piece_id so the two ledgers cannot drift apart.
ALTER TABLE product_huids ADD COLUMN piece_id INTEGER REFERENCES inventory_pieces(id);
CREATE INDEX IF NOT EXISTS idx_product_huids_piece ON product_huids(piece_id);

-- Draft purchase lines store their per-piece rows as JSON until finalize.
ALTER TABLE inward_items ADD COLUMN pieces TEXT NOT NULL DEFAULT '[]';

-- The exact piece a bill line sold.
ALTER TABLE invoice_items ADD COLUMN piece_id INTEGER REFERENCES inventory_pieces(id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_piece ON invoice_items(piece_id);
