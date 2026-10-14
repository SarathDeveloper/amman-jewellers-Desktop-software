-- Correct the hills spelling on the seeded shop address.
UPDATE shop_settings
SET value = 'Karumandurai, Salem Main Road, Periya Kalvarayan Hills, Vadakku Nadu'
WHERE key = 'address_line2'
  AND value = 'Karumandurai, Salem Main Road, Periya Karaiyan Hills, Vadakku Nadu';
