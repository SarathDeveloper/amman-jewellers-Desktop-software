-- Hallmark Unique ID (HUID) chosen for a sold piece.
-- Empty for lines that are not tied to a tagged product piece.
ALTER TABLE invoice_items ADD COLUMN huid TEXT NOT NULL DEFAULT '';
