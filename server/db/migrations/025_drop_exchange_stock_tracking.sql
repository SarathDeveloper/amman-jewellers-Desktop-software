-- Old-gold exchange is no longer counted in weight stock.
DELETE FROM stock_movements WHERE movement_type = 'exchange_in';

UPDATE metal_day_closing_lines
SET closing_weight = closing_weight - exchange_weight,
    exchange_weight = 0
WHERE exchange_weight != 0;
