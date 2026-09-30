ALTER TABLE invoices ADD COLUMN bill_format TEXT NOT NULL DEFAULT 'cash_bill';
ALTER TABLE invoices ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE invoices ADD COLUMN amount_paid REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN balance_due REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN discount REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN cgst REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN sgst REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN igst REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN is_estimate INTEGER NOT NULL DEFAULT 0;

ALTER TABLE invoice_items ADD COLUMN gross_weight REAL NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN net_weight REAL NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN stone_weight REAL NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN metal_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN making_charges REAL NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN wastage_pct REAL NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN stone_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN line_subtotal REAL NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN line_tax REAL NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN hsn_code TEXT NOT NULL DEFAULT '7113';

UPDATE invoice_items
SET
  metal_rate = rate,
  line_subtotal = line_total,
  net_weight = COALESCE((
    SELECT p.net_weight FROM products p WHERE p.id = invoice_items.product_id
  ), 0),
  gross_weight = COALESCE((
    SELECT p.gross_weight FROM products p WHERE p.id = invoice_items.product_id
  ), 0),
  making_charges = COALESCE((
    SELECT p.making_charges FROM products p WHERE p.id = invoice_items.product_id
  ), 0)
WHERE metal_rate = 0 OR line_subtotal = 0;

CREATE TABLE IF NOT EXISTS shop_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO shop_settings (key, value) VALUES
  ('shop_name', ''),
  ('tagline', ''),
  ('gstin', ''),
  ('phone1', ''),
  ('phone2', ''),
  ('address_line1', ''),
  ('address_line2', ''),
  ('address_line3', ''),
  ('signature_image_path', ''),
  ('default_printer_cash', ''),
  ('default_printer_tax', '');

CREATE TABLE IF NOT EXISTS metal_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_date TEXT NOT NULL UNIQUE,
  gold_22k REAL NOT NULL DEFAULT 0,
  gold_24k REAL NOT NULL DEFAULT 0,
  silver_fine REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
