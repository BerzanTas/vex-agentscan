-- migrate:up
CREATE INDEX idx_activities_tx_hash ON activities (lower(tx_hash)) WHERE tx_hash IS NOT NULL;

-- migrate:down
DROP INDEX idx_activities_tx_hash;
