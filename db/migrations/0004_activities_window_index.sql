-- migrate:up
CREATE INDEX idx_activities_verified_window
  ON activities (client_confirmed_at, agent_hash)
  WHERE verification_state IN ('verified_full', 'verified_basic');

-- migrate:down
DROP INDEX idx_activities_verified_window;
