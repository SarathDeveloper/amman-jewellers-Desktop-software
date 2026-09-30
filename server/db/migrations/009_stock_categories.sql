CREATE TABLE IF NOT EXISTS stock_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO stock_categories (name, sort_order) VALUES
  ('Chain', 1),
  ('Necklace', 2),
  ('Haram', 3),
  ('Bangle', 4),
  ('Ring', 5),
  ('Stud', 6),
  ('Mattal', 7),
  ('Nosepin', 8),
  ('Thali', 9),
  ('Gundu', 10),
  ('L. Coin', 11),
  ('P. Coin', 12),
  ('Nanal', 13),
  ('Backchain', 14),
  ('D Studs', 15);
