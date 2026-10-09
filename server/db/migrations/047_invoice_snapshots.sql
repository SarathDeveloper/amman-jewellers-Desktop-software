-- Immutable bill snapshots: what was printed must not change when the
-- product catalog, customer record, or metal rates are edited later.

-- Line purity as sold.
ALTER TABLE invoice_items ADD COLUMN purity TEXT NOT NULL DEFAULT '';

-- Customer details captured at finalize.
ALTER TABLE invoices ADD COLUMN customer_name_snap TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN customer_phone_snap TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN customer_address_snap TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN customer_gstin_snap TEXT NOT NULL DEFAULT '';

-- Metal rates captured at finalize (JSON object matching MetalRates).
ALTER TABLE invoices ADD COLUMN rates_snapshot TEXT NOT NULL DEFAULT '';

-- Backfill line purity from the current catalog for existing bills.
UPDATE invoice_items
SET purity = COALESCE(
  (SELECT p.purity FROM products p WHERE p.id = invoice_items.product_id),
  ''
)
WHERE purity = '' AND product_id IS NOT NULL;

-- Backfill the customer snapshot for already-finalized bills.
UPDATE invoices
SET customer_name_snap = COALESCE((SELECT c.name FROM customers c WHERE c.id = invoices.customer_id), ''),
    customer_phone_snap = COALESCE((SELECT c.phone FROM customers c WHERE c.id = invoices.customer_id), ''),
    customer_address_snap = COALESCE((SELECT c.address FROM customers c WHERE c.id = invoices.customer_id), ''),
    customer_gstin_snap = COALESCE((SELECT c.gstin FROM customers c WHERE c.id = invoices.customer_id), '')
WHERE status = 'final';

-- Backfill the rate snapshot from the latest rates on or before the bill date.
UPDATE invoices
SET rates_snapshot = COALESCE((
  SELECT json_object(
    'effectiveDate', mr.effective_date,
    'gold22k', mr.gold_22k,
    'gold24k', mr.gold_24k,
    'gold20k', mr.gold_20k,
    'gold18k', mr.gold_18k,
    'silverFine', mr.silver_fine,
    'silver925', mr.silver_925
  )
  FROM metal_rates mr
  WHERE mr.effective_date <= invoices.invoice_date
  ORDER BY mr.effective_date DESC
  LIMIT 1
), '')
WHERE status = 'final';
