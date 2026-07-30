-- migrate:up
CREATE TABLE agents (
  agent_hash TEXT PRIMARY KEY CHECK (agent_hash ~ '^[0-9a-f]{64}$'),
  ingest_token_sha256 TEXT NOT NULL,
  consent_version INT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','quarantined')),
  strike_count SMALLINT NOT NULL DEFAULT 0,
  first_verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  quarantined_at TIMESTAMPTZ,
  purged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activities (
  id BIGSERIAL PRIMARY KEY,
  agent_hash TEXT NOT NULL REFERENCES agents(agent_hash),
  source_row_id TEXT NOT NULL,
  public_id TEXT UNIQUE NOT NULL,
  source_execution_id TEXT NOT NULL,
  event_index INT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('swap','bridge')),
  event_role TEXT NOT NULL CHECK (event_role IN ('swap','bridge_deposit','bridge_fill_expected','bridge_fill_observed','bridge_refund')),
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','definitively_failed')),
  protocol TEXT NOT NULL,
  chain_family TEXT NOT NULL CHECK (chain_family IN ('eip155','solana')),
  chain_id BIGINT NOT NULL,
  from_chain_id BIGINT,
  to_chain_id BIGINT,
  token_in_address TEXT, token_in_symbol TEXT, token_in_decimals SMALLINT,
  token_out_address TEXT, token_out_symbol TEXT, token_out_decimals SMALLINT,
  amount_in_raw TEXT, amount_out_raw TEXT,
  executed_in_raw TEXT, executed_out_raw TEXT,
  usd_in_est NUMERIC, usd_out_est NUMERIC, usd_fee_est NUMERIC,
  usd_source TEXT,
  tx_hash TEXT,
  failure_code TEXT,
  client_created_at TIMESTAMPTZ NOT NULL,
  client_confirmed_at TIMESTAMPTZ,
  client_observed_at TIMESTAMPTZ,
  statuses_seen TEXT[] NOT NULL,
  verification_state TEXT NOT NULL DEFAULT 'none'
    CHECK (verification_state IN ('none','queued','verified_full','verified_basic','mismatch')),
  verified_at TIMESTAMPTZ,
  backfill BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_schema_version INT NOT NULL,
  UNIQUE (agent_hash, source_row_id)
);
CREATE INDEX idx_activities_feed ON activities (received_at DESC, id DESC);
CREATE INDEX idx_activities_visibility ON activities (status, verification_state);
CREATE INDEX idx_activities_agent_confirmed ON activities (agent_hash, client_confirmed_at);

CREATE TABLE verification_jobs (
  activity_id BIGINT PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
  attempts INT NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_attempt_at TIMESTAMPTZ NOT NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_verification_jobs_due ON verification_jobs (next_attempt_at);

CREATE TABLE strikes (
  id BIGSERIAL PRIMARY KEY,
  agent_hash TEXT NOT NULL REFERENCES agents(agent_hash),
  activity_id BIGINT,
  reason TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE daily_aggregates (
  day DATE NOT NULL,
  protocol TEXT NOT NULL,
  kind TEXT NOT NULL,
  volume_usd NUMERIC NOT NULL DEFAULT 0,
  tx_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, protocol, kind)
);

CREATE TABLE worker_heartbeat (
  worker_name TEXT PRIMARY KEY,
  beat_at TIMESTAMPTZ NOT NULL
);

-- migrate:down
DROP TABLE worker_heartbeat, daily_aggregates, strikes, verification_jobs, activities, agents;
