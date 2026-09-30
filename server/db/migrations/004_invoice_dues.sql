ALTER TABLE customer_dues ADD COLUMN invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_dues_invoice
  ON customer_dues(invoice_id)
  WHERE invoice_id IS NOT NULL;

INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, invoice_id, created_at)
SELECT i.customer_id, i.invoice_date, 'due', i.total, 'Bill ' || i.invoice_no, i.id, i.created_at
FROM invoices i
WHERE i.status = 'final'
  AND NOT EXISTS (SELECT 1 FROM customer_dues d WHERE d.invoice_id = i.id);
