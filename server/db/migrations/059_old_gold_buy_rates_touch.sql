-- Phase 3 of the old gold overhaul: a separate buying rate per purity, and a
-- touch percentage on purchase items so an impure lot can be valued on its fine
-- content.

-- Buying rates. A zero buying rate means "use the selling rate".
ALTER TABLE metal_rates ADD COLUMN gold_22k_buy REAL NOT NULL DEFAULT 0;
ALTER TABLE metal_rates ADD COLUMN gold_24k_buy REAL NOT NULL DEFAULT 0;
ALTER TABLE metal_rates ADD COLUMN gold_20k_buy REAL NOT NULL DEFAULT 0;
ALTER TABLE metal_rates ADD COLUMN gold_18k_buy REAL NOT NULL DEFAULT 0;
ALTER TABLE metal_rates ADD COLUMN silver_fine_buy REAL NOT NULL DEFAULT 0;
ALTER TABLE metal_rates ADD COLUMN silver_925_buy REAL NOT NULL DEFAULT 0;

-- Touch percent (0 = touch not recorded), the fine weight it yields, and the
-- metal derived from the purity.
ALTER TABLE old_gold_purchase_items ADD COLUMN touch_pct REAL NOT NULL DEFAULT 0;
ALTER TABLE old_gold_purchase_items ADD COLUMN fine_weight REAL NOT NULL DEFAULT 0;
ALTER TABLE old_gold_purchase_items ADD COLUMN metal TEXT NOT NULL DEFAULT 'Gold';

UPDATE old_gold_purchase_items
SET fine_weight = net_weight
WHERE fine_weight = 0;

UPDATE old_gold_purchase_items
SET metal = CASE
  WHEN purity LIKE '%925%' OR purity LIKE '%ilver%' THEN 'Silver'
  ELSE 'Gold'
END;
