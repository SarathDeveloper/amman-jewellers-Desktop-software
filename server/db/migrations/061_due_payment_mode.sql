-- Dues payments were reported by guessing the payment mode from the note text,
-- which pushed every bill payment into Cash. Store the mode on the ledger row.

ALTER TABLE customer_dues ADD COLUMN mode TEXT;

-- Backfill bill payments: a note hint wins, otherwise the mode already held on
-- the invoice that the payment belongs to.
UPDATE customer_dues
SET mode = CASE
  WHEN instr(lower(note), 'upi') > 0 THEN 'upi'
  WHEN instr(lower(note), 'card') > 0 THEN 'card'
  WHEN instr(lower(note), 'mixed') > 0 THEN 'mixed'
  WHEN instr(lower(note), 'cash') > 0 THEN 'cash'
  ELSE (
    SELECT i.payment_mode FROM invoices i
    WHERE i.id = customer_dues.invoice_id
  )
END
WHERE kind = 'payment' AND invoice_id IS NOT NULL;

-- Pledge payments already carry their own mode on pledge_payments, but copy it
-- across so every payment row answers the same question the same way.
UPDATE customer_dues
SET mode = (
  SELECT pp.mode FROM pledge_payments pp
  WHERE pp.id = customer_dues.pledge_payment_id
)
WHERE kind = 'payment'
  AND pledge_payment_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM pledge_payments pp WHERE pp.id = customer_dues.pledge_payment_id);
