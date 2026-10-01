CREATE TABLE IF NOT EXISTS gold_saving_schemes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  monthly_amount REAL NOT NULL,
  duration_months INTEGER NOT NULL,
  min_installment REAL,
  max_installment REAL,
  purity TEXT NOT NULL DEFAULT '22K',
  gold_rate_source TEXT NOT NULL DEFAULT 'configured' CHECK (gold_rate_source IN ('configured', 'manual_allowed')),
  gold_rate_unit TEXT NOT NULL DEFAULT 'per_gram',
  bonus_type TEXT NOT NULL DEFAULT 'none' CHECK (bonus_type IN ('none', 'fixed_amount', 'percentage', 'additional_gold')),
  bonus_value REAL NOT NULL DEFAULT 0,
  bonus_eligibility TEXT NOT NULL DEFAULT '',
  allow_late_payments INTEGER NOT NULL DEFAULT 1,
  grace_period_days INTEGER NOT NULL DEFAULT 0,
  allow_missed_installments INTEGER NOT NULL DEFAULT 0,
  allow_early_closure INTEGER NOT NULL DEFAULT 0,
  allow_partial_redemption INTEGER NOT NULL DEFAULT 0,
  allow_multiple_accounts INTEGER NOT NULL DEFAULT 0,
  redemption_type TEXT NOT NULL DEFAULT 'jewellery' CHECK (redemption_type IN ('gold', 'jewellery', 'configurable')),
  making_charge_rules TEXT NOT NULL DEFAULT '',
  wastage_rules TEXT NOT NULL DEFAULT '',
  available_from TEXT,
  available_to TEXT,
  terms TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gold_saving_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  scheme_id INTEGER NOT NULL,
  monthly_amount REAL NOT NULL,
  duration_months INTEGER NOT NULL,
  purity TEXT NOT NULL,
  enrollment_date TEXT NOT NULL,
  first_installment_date TEXT NOT NULL,
  maturity_date TEXT NOT NULL,
  preferred_payment_day INTEGER,
  nominee_name TEXT NOT NULL DEFAULT '',
  nominee_relationship TEXT NOT NULL DEFAULT '',
  nominee_phone TEXT NOT NULL DEFAULT '',
  terms_accepted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'matured', 'redeemed', 'cancelled', 'closed')),
  closed_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (scheme_id) REFERENCES gold_saving_schemes(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS gold_saving_installments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  installment_no INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'due', 'paid', 'overdue', 'waived')),
  paid_at TEXT,
  UNIQUE (account_id, installment_no),
  FOREIGN KEY (account_id) REFERENCES gold_saving_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gs_schemes_status ON gold_saving_schemes(status);
CREATE INDEX IF NOT EXISTS idx_gs_accounts_customer ON gold_saving_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_gs_accounts_scheme ON gold_saving_accounts(scheme_id);
CREATE INDEX IF NOT EXISTS idx_gs_accounts_status ON gold_saving_accounts(status);
CREATE INDEX IF NOT EXISTS idx_gs_accounts_maturity ON gold_saving_accounts(maturity_date);
CREATE INDEX IF NOT EXISTS idx_gs_installments_account ON gold_saving_installments(account_id);
CREATE INDEX IF NOT EXISTS idx_gs_installments_due ON gold_saving_installments(due_date, status);
