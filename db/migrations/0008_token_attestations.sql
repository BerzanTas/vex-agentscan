-- migrate:up
CREATE TABLE token_attestations (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  token_address TEXT NOT NULL CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  recovered_signer TEXT NOT NULL CHECK (recovered_signer ~ '^0x[0-9a-f]{40}$'),
  attest_signature TEXT NOT NULL,
  tx_hash_hint TEXT,
  derived_tx_hash TEXT,
  verify_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verify_status IN ('unverified','verified','mismatch','unverifiable')),
  verify_detail TEXT,
  verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  submitter_ip_hash TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, token_address, recovered_signer)
);

CREATE INDEX idx_token_attestations_pending
  ON token_attestations (next_attempt_at)
  WHERE verify_status = 'unverified' AND revoked_at IS NULL;

CREATE INDEX idx_token_attestations_lookup
  ON token_attestations (chain_id, token_address);

CREATE INDEX idx_token_attestations_pending_by_ip
  ON token_attestations (submitter_ip_hash)
  WHERE verify_status = 'unverified' AND revoked_at IS NULL;

-- migrate:down
DROP TABLE token_attestations;
