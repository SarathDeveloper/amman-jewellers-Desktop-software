-- Phase 5: pledge photos, reminder log and KYC metadata.
-- Photos are stored as files in the uploads folder (named with a random UUID and
-- never overwritten); only the relative /uploads path is kept here.
CREATE TABLE pledge_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pledge_id INTEGER NOT NULL REFERENCES pledges(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('item', 'customer', 'id_proof')),
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pledge_photos_pledge ON pledge_photos(pledge_id);

-- One row per reminder actually opened (WhatsApp), so the list can show when a
-- borrower was last reminded.
CREATE TABLE pledge_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pledge_id INTEGER NOT NULL REFERENCES pledges(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'interest',
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pledge_reminders_pledge ON pledge_reminders(pledge_id);

-- ID proof type for KYC (Aadhaar / PAN numbers already live on customers).
ALTER TABLE customers ADD COLUMN id_proof_type TEXT NOT NULL DEFAULT '';
