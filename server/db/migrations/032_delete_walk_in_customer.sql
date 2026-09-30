-- Finish Walk-in removal (reassign linked rows, then delete)

UPDATE invoices
SET customer_id = (
  SELECT id FROM customers
  WHERE name != 'Walk-in'
  ORDER BY id
  LIMIT 1
)
WHERE customer_id IN (SELECT id FROM customers WHERE name = 'Walk-in')
AND EXISTS (SELECT 1 FROM customers WHERE name != 'Walk-in');

UPDATE customer_dues
SET customer_id = (
  SELECT id FROM customers
  WHERE name != 'Walk-in'
  ORDER BY id
  LIMIT 1
)
WHERE customer_id IN (SELECT id FROM customers WHERE name = 'Walk-in')
AND EXISTS (SELECT 1 FROM customers WHERE name != 'Walk-in');

UPDATE pledges
SET customer_id = (
  SELECT id FROM customers
  WHERE name != 'Walk-in'
  ORDER BY id
  LIMIT 1
)
WHERE customer_id IN (SELECT id FROM customers WHERE name = 'Walk-in')
AND EXISTS (SELECT 1 FROM customers WHERE name != 'Walk-in');

DELETE FROM customers
WHERE name = 'Walk-in'
  AND id NOT IN (SELECT customer_id FROM invoices)
  AND id NOT IN (SELECT customer_id FROM customer_dues)
  AND id NOT IN (SELECT customer_id FROM pledges);
