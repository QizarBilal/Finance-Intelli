BEGIN;

ALTER TABLE profile ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';
ALTER TABLE profile ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en-IN';
ALTER TABLE profile ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profile ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE profile ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE profile ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE profile ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE profile ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS profile_email_uq ON profile (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS accounts (
  id serial PRIMARY KEY,
  profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('cash','bank','credit_card','loan','investment','wallet')),
  currency text NOT NULL DEFAULT 'INR',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  institution text,
  account_number_last4 text,
  color text,
  icon text,
  include_in_net_worth boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','closed')),
  last_reconciled_date date,
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_profile_name_uq ON accounts(profile_id, name);
CREATE INDEX IF NOT EXISTS accounts_profile_status_idx ON accounts(profile_id, status);

INSERT INTO accounts(profile_id, name, type, currency, opening_balance)
SELECT id, 'Opening account', 'bank', currency, 0 FROM profile
ON CONFLICT (profile_id, name) DO NOTHING;

DO $$ DECLARE fallback_profile integer;
BEGIN
  SELECT id INTO fallback_profile FROM profile ORDER BY id LIMIT 1;
  IF fallback_profile IS NOT NULL THEN
    UPDATE transactions SET profile_id = fallback_profile WHERE profile_id IS NULL;
    UPDATE categories SET profile_id = fallback_profile WHERE profile_id IS NULL;
    UPDATE budgets SET profile_id = fallback_profile WHERE profile_id IS NULL;
    UPDATE goals SET profile_id = fallback_profile WHERE profile_id IS NULL;
    UPDATE reminders SET profile_id = fallback_profile WHERE profile_id IS NULL;
  END IF;
END $$;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS normalized_name text;
UPDATE categories SET normalized_name = lower(trim(name)) WHERE normalized_name IS NULL;
ALTER TABLE categories ALTER COLUMN normalized_name SET NOT NULL;
DELETE FROM categories a USING categories b
WHERE a.id > b.id AND a.profile_id = b.profile_id
  AND a.normalized_name = b.normalized_name AND a.type = b.type;
CREATE UNIQUE INDEX IF NOT EXISTS categories_profile_normalized_type_uq
  ON categories(profile_id, normalized_name, type);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id integer REFERENCES accounts(id) ON DELETE RESTRICT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_id integer REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_group_id uuid;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS direction text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'cleared';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fingerprint text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
UPDATE transactions t SET account_id = a.id
FROM accounts a WHERE a.profile_id = t.profile_id AND a.name = 'Opening account' AND t.account_id IS NULL;
UPDATE transactions SET direction = CASE WHEN type = 'income' THEN 'credit' ELSE 'debit' END WHERE direction IS NULL;
UPDATE transactions t SET category_id = c.id
FROM categories c WHERE c.profile_id = t.profile_id AND lower(trim(c.name)) = lower(trim(t.category))
  AND t.category_id IS NULL;
ALTER TABLE transactions ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN direction SET NOT NULL;
ALTER TABLE categories ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE budgets ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE goals ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE reminders ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_amount_positive_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_amount_positive_check CHECK (amount > 0);
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('expense','income','transfer'));
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_direction_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_direction_check CHECK (direction IN ('debit','credit'));
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check CHECK (status IN ('pending','cleared','reconciled','void'));
CREATE INDEX IF NOT EXISTS transactions_profile_date_idx ON transactions(profile_id, date);
CREATE INDEX IF NOT EXISTS transactions_profile_type_date_idx ON transactions(profile_id, type, date);
CREATE INDEX IF NOT EXISTS transactions_profile_category_date_idx ON transactions(profile_id, category_id, date);
CREATE INDEX IF NOT EXISTS transactions_account_status_date_idx ON transactions(account_id, status, date);
CREATE INDEX IF NOT EXISTS transactions_transfer_group_idx ON transactions(transfer_group_id);

ALTER TABLE budgets ADD COLUMN IF NOT EXISTS rollover integer NOT NULL DEFAULT 0;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS account_balance_snapshots (
  id serial PRIMARY KEY, profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  account_id integer NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  balance numeric(18,2) NOT NULL, as_of_date date NOT NULL,
  source text NOT NULL DEFAULT 'system', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_balance_snapshot_uq ON account_balance_snapshots(account_id, as_of_date, source);

CREATE TABLE IF NOT EXISTS reconciliations (
  id serial PRIMARY KEY, profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  account_id integer NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  statement_date date NOT NULL, statement_balance numeric(18,2) NOT NULL,
  calculated_balance numeric(18,2) NOT NULL, difference numeric(18,2) NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
  completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id serial PRIMARY KEY, profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, user_agent text, ip_address text,
  expires_at timestamptz NOT NULL, last_used_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_profile_active_idx ON sessions(profile_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id serial PRIMARY KEY, profile_id integer REFERENCES profile(id) ON DELETE SET NULL,
  action text NOT NULL, entity_type text NOT NULL, entity_id text,
  before_json text, after_json text, ip_address text, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_profile_created_idx ON audit_logs(profile_id, created_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id serial PRIMARY KEY, identifier_hash text NOT NULL, ip_address text,
  succeeded text NOT NULL DEFAULT 'false', attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_identifier_time_idx ON login_attempts(identifier_hash, attempted_at);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id serial PRIMARY KEY, profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  entity_type text NOT NULL, entity_id integer NOT NULL, frequency text NOT NULL,
  interval integer NOT NULL DEFAULT 1, next_run_at timestamptz NOT NULL, end_date date,
  max_occurrences integer, occurrence_count integer NOT NULL DEFAULT 0,
  mode text NOT NULL DEFAULT 'confirm', status text NOT NULL DEFAULT 'active',
  timezone text NOT NULL DEFAULT 'UTC', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recurring_rules_due_idx ON recurring_rules(status, next_run_at);

CREATE TABLE IF NOT EXISTS recurrence_runs (
  id serial PRIMARY KEY, rule_id integer NOT NULL REFERENCES recurring_rules(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL, status text NOT NULL, result_entity_id integer,
  error text, processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_id, scheduled_for)
);

CREATE TABLE IF NOT EXISTS goal_contributions (
  id serial PRIMARY KEY, profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  goal_id integer NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  account_id integer REFERENCES accounts(id) ON DELETE SET NULL,
  transaction_id integer REFERENCES transactions(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL CHECK(amount <> 0), note text,
  reversed_contribution_id integer, is_reversed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goal_contributions_goal_created_idx ON goal_contributions(goal_id, created_at);

COMMIT;
