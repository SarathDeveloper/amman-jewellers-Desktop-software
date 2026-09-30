DROP TABLE IF EXISTS stock_movements;

DELETE FROM shop_settings
WHERE key IN ('stock_ledger_start_date', 'stock_ledger_backfilled');
