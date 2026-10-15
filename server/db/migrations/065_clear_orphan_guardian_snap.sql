-- 064 originally backfilled every final and cancelled bill. Rows that had no
-- customer snapshot then stored only the father/husband name, and print treated
-- that as the frozen customer. Clear those so the live customer is used again.

UPDATE invoices
SET customer_guardian_snap = ''
WHERE customer_name_snap = ''
  AND customer_phone_snap = ''
  AND customer_address_snap = ''
  AND customer_gstin_snap = ''
  AND customer_guardian_snap != '';
