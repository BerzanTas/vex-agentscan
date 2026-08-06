-- migrate:up
CREATE INDEX idx_activities_verified_confirmed
  ON activities ((COALESCE(client_confirmed_at, verified_at)))
  WHERE verification_state IN ('verified_full', 'verified_basic');

-- migrate:down
DROP INDEX idx_activities_verified_confirmed;
