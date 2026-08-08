-- migrate:up
-- handshake_challenges stores only address_hmacs (HMAC of chainFamily+address), never plaintext
-- addresses: /v2/agents/session/complete requires the caller to resend plaintext addresses inside
-- its signed proofs, so the address set a challenge was opened for never touches the database in
-- cleartext, not even transiently.
CREATE TABLE handshake_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_hash TEXT NOT NULL CHECK (agent_hash ~ '^[0-9a-f]{64}$'),
  nonce TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  address_hmacs TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
CREATE INDEX idx_handshake_challenges_purge ON handshake_challenges (created_at);

CREATE TABLE agent_wallets (
  id BIGSERIAL PRIMARY KEY,
  agent_hash TEXT NOT NULL REFERENCES agents(agent_hash),
  chain_family TEXT NOT NULL CHECK (chain_family IN ('eip155','solana')),
  address_hmac TEXT NOT NULL,
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
