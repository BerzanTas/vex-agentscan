-- migrate:up
CREATE TABLE rate_limit_hits (
  key_hash   TEXT PRIMARY KEY,
  hits       TIMESTAMPTZ[] NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limit_hits_updated_at ON rate_limit_hits (updated_at);

ALTER TABLE rate_limit_hits SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 50);

-- migrate:down
DROP TABLE rate_limit_hits;
