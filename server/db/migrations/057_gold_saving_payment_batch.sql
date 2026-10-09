-- Phase 6: collect several installments at once.
--
-- One receipt covers a batch of installments. Every payment row written in the
-- same collection shares `batch_no`, so a receipt fetched by any row in the
-- batch can list them all. Single-installment collections leave it NULL.

ALTER TABLE gold_saving_payments ADD COLUMN batch_no TEXT;

CREATE INDEX IF NOT EXISTS idx_gold_saving_payments_batch ON gold_saving_payments(batch_no);
