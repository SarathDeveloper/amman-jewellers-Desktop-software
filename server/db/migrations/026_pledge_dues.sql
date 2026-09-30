ALTER TABLE customer_dues ADD COLUMN pledge_id INTEGER REFERENCES pledges(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_dues_pledge_due
  ON customer_dues(pledge_id)
  WHERE pledge_id IS NOT NULL AND kind = 'due';

INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, pledge_id, created_at)
SELECT
  p.customer_id,
  p.pledge_date,
  'due',
  p.loan_amount,
  'Adagu ' || p.receipt_no,
  p.id,
  p.created_at
FROM pledges p
WHERE p.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM customer_dues d WHERE d.pledge_id = p.id AND d.kind = 'due'
  );

INSERT INTO customer_dues (customer_id, entry_date, kind, amount, note, pledge_id, created_at)
SELECT
  p.customer_id,
  p.pledge_date,
  'payment',
  p.amount_collected,
  'Partial payment Adagu ' || p.receipt_no,
  p.id,
  p.created_at
FROM pledges p
WHERE p.status = 'active'
  AND p.amount_collected > 0
  AND EXISTS (
    SELECT 1 FROM customer_dues d WHERE d.pledge_id = p.id AND d.kind = 'due'
  )
  AND NOT EXISTS (
    SELECT 1 FROM customer_dues d WHERE d.pledge_id = p.id AND d.kind = 'payment'
  );
