UPDATE shop_settings SET value = 'S.No' WHERE key = 'tpl_cash_col_sno' AND value IN ('S. No.', 'S. NO.');
UPDATE shop_settings SET value = 'Ornaments' WHERE key = 'tpl_cash_col_particulars' AND value = 'Particulars';
UPDATE shop_settings SET value = 'GST TAX INVOICE' WHERE key = 'tpl_tax_title' AND value = 'TAX INVOICE';
UPDATE shop_settings SET value = 'Bill No :' WHERE key = 'tpl_tax_bill_no_label' AND value = 'Bill No.';
UPDATE shop_settings SET value = 'Date :' WHERE key = 'tpl_tax_date_label' AND value = 'Date:';
UPDATE shop_settings SET value = 'Description' WHERE key = 'tpl_tax_col_particulars' AND value = 'Particulars';
UPDATE shop_settings SET value = 'Signature of the Seller' WHERE key = 'tpl_tax_brand_sign' AND value = 'Brand Manager Signature';
UPDATE shop_settings SET value = 'Signature of the Purchaser' WHERE key = 'tpl_tax_customer_sign' AND value = 'Customer Signature';
