-- Father/husband name captured with the rest of the customer snapshot at finalize,
-- so a later edit to the customer record does not change a printed bill.

ALTER TABLE invoices ADD COLUMN customer_guardian_snap TEXT NOT NULL DEFAULT '';

-- Only bills that already have a customer snapshot. Old-ledger and other final
-- rows with empty snaps still print from the live customer; filling guardian
-- alone would make that partial row win and hide the name, address, and mobile.
UPDATE invoices
SET customer_guardian_snap = COALESCE(
  (SELECT c.guardian_name FROM customers c WHERE c.id = invoices.customer_id),
  ''
)
WHERE status IN ('final', 'cancelled')
  AND (
    customer_name_snap != ''
    OR customer_phone_snap != ''
    OR customer_address_snap != ''
    OR customer_gstin_snap != ''
  );
