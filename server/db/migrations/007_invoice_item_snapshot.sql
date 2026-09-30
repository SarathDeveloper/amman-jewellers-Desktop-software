ALTER TABLE invoice_items ADD COLUMN metal TEXT NOT NULL DEFAULT '';
ALTER TABLE invoice_items ADD COLUMN category TEXT NOT NULL DEFAULT '';

UPDATE invoice_items
SET
  metal = COALESCE((SELECT p.metal FROM products p WHERE p.id = invoice_items.product_id), ''),
  category = COALESCE((SELECT p.category FROM products p WHERE p.id = invoice_items.product_id), '')
WHERE metal = '' OR category = '';
