CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL, username text NOT NULL UNIQUE,
  dob date NOT NULL, country text, region text, currency text NOT NULL DEFAULT 'CAD',
  kyc_tier integer NOT NULL DEFAULT 0, kyc_status text NOT NULL DEFAULT 'none', terms_version text,
  roles jsonb NOT NULL DEFAULT '[]', avatar_url text,
  daily_deposit_cap_cents integer NOT NULL DEFAULT 50000, pending_deposit_cap_cents integer, pending_deposit_cap_at timestamptz,
  self_excluded_until timestamptz, cooldown_until timestamptz,
  tax_id_collected boolean NOT NULL DEFAULT false, tax_id_encrypted text, legal_name text, address jsonb,
  flags jsonb NOT NULL DEFAULT '[]', last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS geo_checks (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), ip text, ip_region text, gps_region text,
  lat double precision, lng double precision, accuracy_m double precision, vpn boolean NOT NULL DEFAULT false,
  ok boolean NOT NULL, region text, reason text, provider text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS geo_checks_user_idx ON geo_checks(user_id, created_at);
CREATE TABLE IF NOT EXISTS kyc_cases (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), provider text NOT NULL, provider_ref text,
  tier_requested integer NOT NULL, status text NOT NULL DEFAULT 'pending', data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), version text NOT NULL, ip text,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY, owner_type text NOT NULL, owner_id text NOT NULL, key text NOT NULL, currency text NOT NULL,
  balance_cents bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_owner_key_cur ON accounts(owner_type, owner_id, key, currency);
CREATE TABLE IF NOT EXISTS transactions (
  id text PRIMARY KEY, idempotency_key text NOT NULL UNIQUE, kind text NOT NULL, status text NOT NULL DEFAULT 'posted',
  currency text NOT NULL, user_id text, ref text, meta jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS txn_user_idx ON transactions(user_id, created_at);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id text PRIMARY KEY, txn_id text NOT NULL REFERENCES transactions(id), account_id text NOT NULL REFERENCES accounts(id),
  delta_cents bigint NOT NULL, balance_after_cents bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_account_idx ON ledger_entries(account_id, created_at);
CREATE TABLE IF NOT EXISTS payment_intents (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), provider text NOT NULL, provider_ref text,
  direction text NOT NULL, method text NOT NULL, amount_cents integer NOT NULL, fee_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL, status text NOT NULL DEFAULT 'pending', meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pi_user_idx ON payment_intents(user_id, created_at);
CREATE INDEX IF NOT EXISTS pi_provider_ref_idx ON payment_intents(provider, provider_ref);
CREATE TABLE IF NOT EXISTS games (
  id text PRIMARY KEY, name text NOT NULL, developer_user_id text, developer_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft', featured boolean NOT NULL DEFAULT false, category text NOT NULL DEFAULT 'arcade',
  tags jsonb NOT NULL DEFAULT '[]', description text NOT NULL DEFAULT '', tagline text, cover_url text, live_version text,
  rating double precision NOT NULL DEFAULT 4.5, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS game_versions (
  id text PRIMARY KEY, game_id text NOT NULL REFERENCES games(id), version text NOT NULL, manifest jsonb NOT NULL,
  storage_path text NOT NULL, size_bytes integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'uploaded', notes text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_versions_unique ON game_versions(game_id, version);
CREATE TABLE IF NOT EXISTS dev_keys (
  id text PRIMARY KEY, user_id text REFERENCES users(id), label text NOT NULL, key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS matches (
  id text PRIMARY KEY, game_id text NOT NULL REFERENCES games(id), game_version text NOT NULL, format text NOT NULL,
  country text NOT NULL, currency text NOT NULL, entry_cents integer NOT NULL, rake_bps integer NOT NULL, seed text NOT NULL,
  status text NOT NULL DEFAULT 'open', practice boolean NOT NULL DEFAULT false, room_id text NOT NULL, max_players integer NOT NULL,
  config jsonb NOT NULL, settlement jsonb, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS matches_open_idx ON matches(game_id, format, status, country, entry_cents);
CREATE TABLE IF NOT EXISTS match_players (
  id text PRIMARY KEY, match_id text NOT NULL REFERENCES matches(id), user_id text NOT NULL REFERENCES users(id),
  player_id text NOT NULL, team integer, entry_txn_id text, status text NOT NULL DEFAULT 'joined', rank integer,
  score double precision, payout_cents integer, submitted_at timestamptz, deadline_at timestamptz, input_log_hash text, input_log jsonb,
  region text, joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS match_players_unique ON match_players(match_id, user_id);
CREATE INDEX IF NOT EXISTS match_players_user_idx ON match_players(user_id, joined_at);
CREATE TABLE IF NOT EXISTS market_items (
  id text PRIMARY KEY, sku text NOT NULL UNIQUE, name text NOT NULL, description text NOT NULL DEFAULT '', kind text NOT NULL DEFAULT 'cosmetic',
  slot text, game_id text, price_cents integer NOT NULL, currency text NOT NULL, image_url text, rarity text NOT NULL DEFAULT 'common',
  grants jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), item_id text NOT NULL REFERENCES market_items(id),
  equipped boolean NOT NULL DEFAULT false, acquired_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_unique ON inventory(user_id, item_id);
CREATE TABLE IF NOT EXISTS analytics_events (
  id text PRIMARY KEY, user_id text, session_id text, event text NOT NULL, props jsonb NOT NULL DEFAULT '{}', region text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_idx ON analytics_events(event, created_at);
CREATE INDEX IF NOT EXISTS events_user_idx ON analytics_events(user_id, created_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target text, meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
