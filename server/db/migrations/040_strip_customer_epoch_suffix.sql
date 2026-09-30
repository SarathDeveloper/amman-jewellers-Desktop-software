-- Strip trailing Date.now() millisecond suffixes from customer names
-- e.g. 'Sundari 1790742540382' → 'Sundari'
UPDATE customers
SET name = trim(substr(name, 1, length(name) - 14))
WHERE name GLOB '* [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';

UPDATE old_gold_purchases
SET customer_name = trim(substr(customer_name, 1, length(customer_name) - 14))
WHERE customer_name GLOB '* [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';
