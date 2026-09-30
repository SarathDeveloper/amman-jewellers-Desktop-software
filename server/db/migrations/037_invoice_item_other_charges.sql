ALTER TABLE invoice_items ADD COLUMN other_charges REAL NOT NULL DEFAULT 0;

UPDATE shop_settings SET key = 'vis_tax_show_other_col' WHERE key = 'vis_tax_show_stone_weight_col';
UPDATE shop_settings SET key = 'vis_tax_show_wastage_col' WHERE key = 'vis_tax_show_va_col';
UPDATE shop_settings SET value = 'a4' WHERE key = 'paper_size_tax';
UPDATE shop_settings SET value = 'Ornaments' WHERE key = 'tpl_tax_col_particulars' AND value IN ('Description', 'Particulars');
UPDATE shop_settings SET value = 'N.T' WHERE key = 'tpl_tax_col_net_wgt' AND value = 'Net Weight';
UPDATE shop_settings SET value = 'G.W' WHERE key = 'tpl_tax_col_gross_wgt' AND value = 'Gross Weight';
