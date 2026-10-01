CREATE TABLE IF NOT EXISTS gold_saving_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  installment_id INTEGER,
  receipt_no TEXT NOT NULL UNIQUE,
  installment_no INTEGER NOT NULL,
  payment_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  late_fee REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total_received REAL NOT NULL,
  gold_rate REAL NOT NULL,
  gold_weight REAL NOT NULL,
  gold_rate_source TEXT NOT NULL DEFAULT 'configured',
  gold_rate_override_reason TEXT NOT NULL DEFAULT '',
  gold_rate_override_by INTEGER,
  purity TEXT NOT NULL,
  payment_mode TEXT NOT NULL,
  transaction_ref TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  reversed_payment_id INTEGER,
  idempotency_key TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES gold_saving_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (installment_id) REFERENCES gold_saving_installments(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gs_payments_posted_installment
  ON gold_saving_payments(installment_id)
  WHERE status = 'posted' AND installment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gs_payments_idempotency
  ON gold_saving_payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

CREATE TABLE IF NOT EXISTS gold_saving_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('payment', 'reversal', 'bonus', 'redemption', 'correction')),
  payment_id INTEGER,
  redemption_id INTEGER,
  amount REAL NOT NULL DEFAULT 0,
  gold_weight REAL NOT NULL DEFAULT 0,
  gold_rate REAL NOT NULL DEFAULT 0,
  cumulative_gold REAL NOT NULL DEFAULT 0,
  txn_ref TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES gold_saving_accounts(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS gold_saving_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  receipt_no TEXT NOT NULL UNIQUE,
  redemption_date TEXT NOT NULL,
  redemption_kind TEXT NOT NULL CHECK (redemption_kind IN ('gold', 'jewellery', 'invoice')),
  gold_weight REAL NOT NULL,
  bonus_gold_weight REAL NOT NULL DEFAULT 0,
  invoice_id INTEGER,
  making_charges REAL NOT NULL DEFAULT 0,
  wastage REAL NOT NULL DEFAULT 0,
  taxes REAL NOT NULL DEFAULT 0,
  invoice_value REAL NOT NULL DEFAULT 0,
  remaining_gold REAL NOT NULL DEFAULT 0,
  closes_account INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES gold_saving_accounts(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS gold_saving_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  changed_by INTEGER,
  before_json TEXT NOT NULL DEFAULT '',
  after_json TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gs_payments_account ON gold_saving_payments(account_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_gs_payments_date ON gold_saving_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_gs_payments_status ON gold_saving_payments(status);
CREATE INDEX IF NOT EXISTS idx_gs_ledger_account ON gold_saving_ledger(account_id, id);
CREATE INDEX IF NOT EXISTS idx_gs_redemptions_account ON gold_saving_redemptions(account_id);
CREATE INDEX IF NOT EXISTS idx_gs_audit_entity ON gold_saving_audit_logs(entity_type, entity_id);
