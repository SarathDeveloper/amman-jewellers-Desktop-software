-- Phase 4: real auction flow. One row per pledge tracks the notice that was
-- sent, the auction that followed, the sale proceeds, and any surplus returned
-- to the borrower or shortfall left (or written off) after the sale.
CREATE TABLE pledge_auctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pledge_id INTEGER NOT NULL UNIQUE REFERENCES pledges(id) ON DELETE CASCADE,
  notice_date TEXT NOT NULL,
  auction_date TEXT,
  buyer_type TEXT CHECK (buyer_type IN ('outside', 'shop')),
  buyer_name TEXT NOT NULL DEFAULT '',
  sale_amount REAL NOT NULL DEFAULT 0,
  payoff_at_auction REAL NOT NULL DEFAULT 0,
  surplus_amount REAL NOT NULL DEFAULT 0,
  surplus_paid_date TEXT,
  surplus_mode TEXT,
  shortfall_amount REAL NOT NULL DEFAULT 0,
  shortfall_written_off INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_pledge_auctions_pledge ON pledge_auctions(pledge_id);
