-- migrate:up
-- handshake_challenges stores only address_hmacs (HMAC of chainFamily+address), never plaintext
-- addresses: /v1/agents/session/complete requires the caller to resend plaintext addresses inside
-- its signed proofs, so the address set a challenge was opened for never touches the database in
-- cleartext, not even transiently. A challenge row is deleted outright the moment its own agent
-- claims it (valid or not), so single-use is enforced by row absence, not a used_at flag; this
-- also caps how long a burned challenge's nonce+domain stay readable to anyone who could see the
-- table, versus retaining every attempted row until the hourly purge sweep.
CREATE TABLE handshake_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_hash TEXT NOT NULL CHECK (agent_hash ~ '^[0-9a-f]{64}$'),
  nonce TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  address_hmacs TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_handshake_challenges_purge ON handshake_challenges (created_at);

-- hmac_version lets a future pepper rotation identify which pepper generation hashed a given row
-- without a data migration; nothing reads it yet, it is insurance for that day.
CREATE TABLE agent_wallets (
  id BIGSERIAL PRIMARY KEY,
  agent_hash TEXT NOT NULL REFERENCES agents(agent_hash),
  chain_family TEXT NOT NULL CHECK (chain_family IN ('eip155','solana')),
  address_hmac TEXT NOT NULL,
  hmac_version SMALLINT NOT NULL DEFAULT 1,
  proof_signature TEXT NOT NULL,
  proven_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_family, address_hmac)
);
CREATE INDEX idx_agent_wallets_agent_hash ON agent_wallets (agent_hash);

ALTER TABLE agents ADD COLUMN name TEXT UNIQUE;
ALTER TABLE agents ADD COLUMN last_handshake_at TIMESTAMPTZ;

-- migrate:down
ALTER TABLE agents DROP COLUMN last_handshake_at;
ALTER TABLE agents DROP COLUMN name;
DROP TABLE agent_wallets;
DROP TABLE handshake_challenges;
