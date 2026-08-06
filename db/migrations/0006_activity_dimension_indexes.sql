-- migrate:up
CREATE INDEX idx_activities_verified_token_in
  ON activities (chain_family, chain_id, lower(token_in_address))
  WHERE verification_state IN ('verified_full', 'verified_basic');

CREATE INDEX idx_activities_verified_token_out
  ON activities (chain_family, chain_id, lower(token_out_address))
  WHERE verification_state IN ('verified_full', 'verified_basic');

CREATE INDEX idx_activities_verified_chain
  ON activities (chain_family, chain_id)
  WHERE verification_state IN ('verified_full', 'verified_basic');

CREATE INDEX idx_activities_protocol_feed
  ON activities (protocol, received_at DESC, id DESC);

CREATE INDEX idx_activities_chain_feed
  ON activities (chain_family, chain_id, received_at DESC, id DESC);

-- migrate:down
DROP INDEX idx_activities_chain_feed;
DROP INDEX idx_activities_protocol_feed;
DROP INDEX idx_activities_verified_chain;
DROP INDEX idx_activities_verified_token_out;
DROP INDEX idx_activities_verified_token_in;
