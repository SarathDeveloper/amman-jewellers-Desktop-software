-- Customer GSTIN + system Walk-in customer
ALTER TABLE customers ADD COLUMN gstin TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;

INSERT INTO customers (name, phone, address, notes, gstin, is_system, created_at)
SELECT 'Walk-in', '', '', 'System walk-in customer for cash bills and Adagu', '', 1, datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE is_system = 1 AND name = 'Walk-in'
);

-- Invoice items: nullable product_id, line_kind, description
CREATE TABLE invoice_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  product_id INTEGER,
  qty INTEGER NOT NULL,
  rate REAL NOT NULL,
  line_total REAL NOT NULL,
  gross_weight REAL NOT NULL DEFAULT 0,
  net_weight REAL NOT NULL DEFAULT 0,
  stone_weight REAL NOT NULL DEFAULT 0,
  metal_rate REAL NOT NULL DEFAULT 0,
  making_charges REAL NOT NULL DEFAULT 0,
  wastage_pct REAL NOT NULL DEFAULT 0,
  stone_rate REAL NOT NULL DEFAULT 0,
  line_subtotal REAL NOT NULL DEFAULT 0,
  line_tax REAL NOT NULL DEFAULT 0,
  hsn_code TEXT NOT NULL DEFAULT '7113',
  metal TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  line_kind TEXT NOT NULL DEFAULT 'sale' CHECK (line_kind IN ('sale', 'exchange')),
  description TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT INTO invoice_items_new (
  id, invoice_id, product_id, qty, rate, line_total,
  gross_weight, net_weight, stone_weight, metal_rate, making_charges,
  wastage_pct, stone_rate, line_subtotal, line_tax, hsn_code, metal, category,
  line_kind, description
)
SELECT
  id, invoice_id, product_id, qty, rate, line_total,
  gross_weight, net_weight, stone_weight, metal_rate, making_charges,
  wastage_pct, stone_rate, line_subtotal, line_tax, hsn_code, metal, category,
  'sale', ''
FROM invoice_items;

DROP TABLE invoice_items;
ALTER TABLE invoice_items_new RENAME TO invoice_items;
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Pledges: allow forfeited status
CREATE TABLE pledges_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  receipt_no TEXT NOT NULL UNIQUE,
  pledge_date TEXT NOT NULL,
  assessed_value REAL NOT NULL DEFAULT 0,
  loan_amount REAL NOT NULL DEFAULT 0,
  interest_pct REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'forfeited')),
  redeemed_date TEXT,
  amount_collected REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

INSERT INTO pledges_new (
  id, customer_id, receipt_no, pledge_date, assessed_value, loan_amount,
  interest_pct, status, redeemed_date, amount_collected, notes, created_at
)
SELECT
  id, customer_id, receipt_no, pledge_date, assessed_value, loan_amount,
  interest_pct, status, redeemed_date, amount_collected, notes, created_at
FROM pledges;

DROP TABLE pledges;
ALTER TABLE pledges_new RENAME TO pledges;
CREATE INDEX IF NOT EXISTS idx_pledges_customer ON pledges(customer_id);
CREATE INDEX IF NOT EXISTS idx_pledges_date ON pledges(pledge_date);
CREATE INDEX IF NOT EXISTS idx_pledges_status ON pledges(status);
