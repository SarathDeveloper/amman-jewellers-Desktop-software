ALTER TABLE metal_rates ADD COLUMN gold_20k REAL NOT NULL DEFAULT 0;
ALTER TABLE metal_rates ADD COLUMN gold_18k REAL NOT NULL DEFAULT 0;
ALTER TABLE metal_rates ADD COLUMN silver_925 REAL NOT NULL DEFAULT 0;

UPDATE metal_rates SET
  gold_20k = ROUND(gold_24k * 20.0 / 24.0, 2),
  gold_18k = ROUND(gold_24k * 18.0 / 24.0, 2),
  silver_925 = ROUND(silver_fine * 925.0 / 999.0, 2);

INSERT OR IGNORE INTO staff_permissions (user_id, feature_key)
SELECT DISTINCT user_id, 'rates' FROM staff_permissions
WHERE feature_key IN ('settings', 'billing');
