DROP INDEX IF EXISTS idx_customer_dues_invoice;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_dues_invoice_due
  ON customer_dues(invoice_id)
  WHERE invoice_id IS NOT NULL AND kind = 'due';
