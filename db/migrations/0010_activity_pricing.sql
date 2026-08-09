-- migrate:up
-- token_prices caches every historical lookup the pricing lane makes, keyed by the hour bucket the
-- activity's time anchor falls in. A row with price_usd NULL is a negative cache entry: the feed
-- answered and had nothing for that coin at that hour. Hits are permanent (a historical price does
-- not change); misses are refetchable once they age past PRICE_MISS_RETRY_HOURS. The table holds no
-- per-agent data, so purge and revoke do not touch it.
CREATE TABLE token_prices (
  chain_family TEXT NOT NULL CHECK (chain_family IN ('eip155','solana')),
  chain_id BIGINT NOT NULL,
  token_address TEXT NOT NULL,
  price_hour TIMESTAMPTZ NOT NULL,
  price_usd NUMERIC,
  confidence NUMERIC,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_family, chain_id, token_address, price_hour)
);

-- usd_in_est/usd_out_est stay as the reporting client sent them and remain visible in per-row
-- detail as client estimates; from here on every published aggregate reads the priced columns
-- instead. pricing_state 'unpriced' is terminal and disclosed, never collapsed into a zero.
ALTER TABLE activities
  ADD COLUMN usd_in_priced NUMERIC,
  ADD COLUMN usd_out_priced NUMERIC,
  ADD COLUMN pricing_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (pricing_state IN ('pending','server_priced','unpriced')),
  ADD COLUMN priced_at TIMESTAMPTZ,
  ADD COLUMN pricing_attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN pricing_next_attempt_at TIMESTAMPTZ;

CREATE INDEX idx_activities_pricing_due
  ON activities (pricing_next_attempt_at)
  WHERE pricing_state = 'pending';

-- migrate:down
DROP INDEX idx_activities_pricing_due;
ALTER TABLE activities
  DROP COLUMN pricing_next_attempt_at,
  DROP COLUMN pricing_attempts,
  DROP COLUMN priced_at,
  DROP COLUMN pricing_state,
  DROP COLUMN usd_out_priced,
  DROP COLUMN usd_in_priced;
DROP TABLE token_prices;
