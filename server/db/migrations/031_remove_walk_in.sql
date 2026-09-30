-- Remove system Walk-in customer (reassign any linked rows first)

UPDATE invoices
SET customer_id = (
  SELECT id FROM customers
  WHERE NOT (COALESCE(is_system, 0) = 1 AND name = 'Walk-in')
  ORDER BY id
  LIMIT 1
)
WHERE customer_id IN (
  SELECT id FROM customers WHERE is_system = 1 AND name = 'Walk-in'
)
AND EXISTS (
  SELECT 1 FROM customers WHERE NOT (COALESCE(is_system, 0) = 1 AND name = 'Walk-in')
);

UPDATE customer_dues
SET customer_id = (
  SELECT id FROM customers
  WHERE NOT (COALESCE(is_system, 0) = 1 AND name = 'Walk-in')
  ORDER BY id
  LIMIT 1
)
WHERE customer_id IN (
  SELECT id FROM customers WHERE is_system = 1 AND name = 'Walk-in'
)
AND EXISTS (
  SELECT 1 FROM customers WHERE NOT (COALESCE(is_system, 0) = 1 AND name = 'Walk-in')
);

UPDATE pledges
SET customer_id = (
  SELECT id FROM customers
  WHERE NOT (COALESCE(is_system, 0) = 1 AND name = 'Walk-in')
  ORDER BY id
  LIMIT 1
)
WHERE customer_id IN (
  SELECT id FROM customers WHERE is_system = 1 AND name = 'Walk-in'
)
AND EXISTS (
  SELECT 1 FROM customers WHERE NOT (COALESCE(is_system, 0) = 1 AND name = 'Walk-in')
);

DELETE FROM customers
WHERE is_system = 1
  AND name = 'Walk-in'
  AND id NOT IN (SELECT customer_id FROM invoices)
  AND id NOT IN (SELECT customer_id FROM customer_dues)
  AND id NOT IN (SELECT customer_id FROM pledges);

UPDATE customers
SET is_system = 0,
    notes = CASE
      WHEN name = 'Walk-in' AND notes LIKE 'System walk-in%' THEN ''
      ELSE notes
    END
WHERE is_system = 1;
