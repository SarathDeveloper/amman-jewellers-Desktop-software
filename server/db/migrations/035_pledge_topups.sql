CREATE TABLE IF NOT EXISTS pledge_topups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pledge_id INTEGER NOT NULL REFERENCES pledges(id) ON DELETE CASCADE,
  topup_date TEXT NOT NULL,
  amount REAL NOT NULL,
  interest_pct REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pledge_topups_pledge ON pledge_topups(pledge_id);
