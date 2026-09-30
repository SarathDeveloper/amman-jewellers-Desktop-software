-- Adagu / gold pledge receipt template fields
ALTER TABLE customers ADD COLUMN guardian_name TEXT NOT NULL DEFAULT '';

ALTER TABLE pledges ADD COLUMN pledge_type TEXT NOT NULL DEFAULT 'GOLD JEWELLERY';
ALTER TABLE pledges ADD COLUMN guardian_name TEXT NOT NULL DEFAULT '';
ALTER TABLE pledges ADD COLUMN customer_address TEXT NOT NULL DEFAULT '';
ALTER TABLE pledges ADD COLUMN charges REAL NOT NULL DEFAULT 0;
ALTER TABLE pledges ADD COLUMN repayment_due_date TEXT;

ALTER TABLE pledge_items ADD COLUMN identification TEXT NOT NULL DEFAULT '';
ALTER TABLE pledge_items ADD COLUMN stone_weight REAL NOT NULL DEFAULT 0;

-- Snapshot borrower details from current customer records for existing pledges
UPDATE pledges
SET
  guardian_name = COALESCE((SELECT guardian_name FROM customers WHERE customers.id = pledges.customer_id), ''),
  customer_address = COALESCE((SELECT address FROM customers WHERE customers.id = pledges.customer_id), '')
WHERE guardian_name = '' AND customer_address = '';
