-- Seed Amman Jewellers shop identity when still unset / product placeholder.
INSERT OR IGNORE INTO shop_settings (key, value) VALUES
  ('shop_name', 'AMMAN JEWELLERS'),
  ('gstin', '33BKJPP1190A1ZJ'),
  ('phone1', '8903457570'),
  ('phone2', '9583512688'),
  ('address_line1', 'No. 4, Kavitha Complex'),
  ('address_line2', 'Karumandurai, Salem Main Road, Periya Karaiyan Hills, Vadakku Nadu'),
  ('city', 'Salem'),
  ('state', 'Tamil Nadu'),
  ('pincode', '636138');

UPDATE shop_settings SET value = 'AMMAN JEWELLERS'
WHERE key = 'shop_name' AND trim(value) IN ('', 'JewelTrackerPro');

UPDATE shop_settings SET value = '33BKJPP1190A1ZJ'
WHERE key = 'gstin' AND trim(value) = '';

UPDATE shop_settings SET value = '8903457570'
WHERE key = 'phone1' AND trim(value) = '';

UPDATE shop_settings SET value = '9583512688'
WHERE key = 'phone2' AND trim(value) = '';

UPDATE shop_settings SET value = 'No. 4, Kavitha Complex'
WHERE key = 'address_line1' AND trim(value) = '';

UPDATE shop_settings SET value = 'Karumandurai, Salem Main Road, Periya Karaiyan Hills, Vadakku Nadu'
WHERE key = 'address_line2' AND trim(value) = '';

UPDATE shop_settings SET value = 'Salem'
WHERE key = 'city' AND trim(value) = '';

UPDATE shop_settings SET value = 'Tamil Nadu'
WHERE key = 'state' AND trim(value) = '';

UPDATE shop_settings SET value = '636138'
WHERE key = 'pincode' AND trim(value) = '';
