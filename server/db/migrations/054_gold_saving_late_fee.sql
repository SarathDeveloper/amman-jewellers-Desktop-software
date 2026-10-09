-- Phase 3: late-fee rules per scheme.
--
-- `late_fee_type` is none, fixed or per_day. `late_fee_value` is the amount for a
-- fixed fee and the amount per late day for a per-day fee. Days are counted
-- after `grace_period_days`. Nothing is backfilled; existing schemes stay 'none'.

ALTER TABLE gold_saving_schemes ADD COLUMN late_fee_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE gold_saving_schemes ADD COLUMN late_fee_value REAL NOT NULL DEFAULT 0;
