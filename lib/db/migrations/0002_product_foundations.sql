BEGIN;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_rate numeric(7,4);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS minimum_payment numeric(18,2);
CREATE TABLE IF NOT EXISTS transaction_splits (
 id serial PRIMARY KEY, transaction_id integer NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
 category_id integer REFERENCES categories(id) ON DELETE SET NULL, amount numeric(18,2) NOT NULL, note text
);
CREATE INDEX IF NOT EXISTS transaction_splits_transaction_idx ON transaction_splits(transaction_id);
CREATE TABLE IF NOT EXISTS categorization_rules (
 id serial PRIMARY KEY, profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
 name text NOT NULL, field text NOT NULL, operator text NOT NULL, value text NOT NULL,
 category_id integer REFERENCES categories(id) ON DELETE SET NULL, merchant text,
 priority integer NOT NULL DEFAULT 100, enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categorization_rules_profile_priority_idx ON categorization_rules(profile_id, priority);
CREATE TABLE IF NOT EXISTS import_batches (
 id serial PRIMARY KEY, profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
 account_id integer NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, filename text NOT NULL,
 status text NOT NULL DEFAULT 'preview', total_rows integer NOT NULL DEFAULT 0,
 imported_rows integer NOT NULL DEFAULT 0, duplicate_rows integer NOT NULL DEFAULT 0,
 mapping jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS attachments (
 id serial PRIMARY KEY, profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
 transaction_id integer REFERENCES transactions(id) ON DELETE CASCADE, storage_key text NOT NULL,
 filename text NOT NULL, mime_type text NOT NULL, size integer NOT NULL,
 encrypted boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exchange_rates (
 id serial PRIMARY KEY, base_currency text NOT NULL, quote_currency text NOT NULL,
 rate numeric(20,8) NOT NULL, rate_date text NOT NULL, source text NOT NULL,
 UNIQUE(base_currency, quote_currency, rate_date)
);
CREATE TABLE IF NOT EXISTS jobs (
 id serial PRIMARY KEY, profile_id integer REFERENCES profile(id) ON DELETE CASCADE,
 type text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 5,
 run_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, completed_at timestamptz,
 last_error text, idempotency_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_ready_idx ON jobs(status, run_at);
CREATE TABLE IF NOT EXISTS saved_views (
 id serial PRIMARY KEY, profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
 name text NOT NULL, scope text NOT NULL, filters jsonb NOT NULL,
 is_default boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(profile_id, scope, name)
);
CREATE TABLE IF NOT EXISTS households (
 id serial PRIMARY KEY, name text NOT NULL,
 owner_profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS household_members (
 id serial PRIMARY KEY, household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 profile_id integer NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'member', status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(household_id, profile_id)
);
COMMIT;
