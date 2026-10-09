-- Phase 3: store the running metal rate and assessed value captured when the
-- loan was sanctioned, so valuations stay auditable after rates change.
ALTER TABLE pledge_items ADD COLUMN rate_per_gram REAL NOT NULL DEFAULT 0;
ALTER TABLE pledge_items ADD COLUMN item_value REAL NOT NULL DEFAULT 0;
