-- migrate:up
-- The feed stopped ordering by received_at and now orders by the event time read-repo builds from
-- activityEventTimeSql, so idx_activities_feed, idx_activities_protocol_feed and
-- idx_activities_chain_feed no longer answer any ordering and every page planned a full sort of the
-- filtered set for fifty rows. These three restore the one-for-one coverage those had: the bare
-- feed, the protocol-filtered feed and the chain-filtered feed.
--
-- As in 0012, the nesting is load-bearing: Postgres matches an expression index by structural
-- equality, so the COALESCE inside a COALESCE must be written exactly as read-repo composes it. A
-- flattened three-term COALESCE matches nothing and fails quietly.
--
-- The third date_trunc argument is not decoration. date_trunc(text, timestamptz) is STABLE, and an
-- index expression must be IMMUTABLE, so the two-argument call the feed used cannot be indexed at
-- all; the three-argument form is IMMUTABLE and, at millisecond precision, the zone cannot change
-- the result. The reading query must therefore call the same three-argument form.
CREATE INDEX idx_activities_event_time_feed
  ON activities (
    (date_trunc('milliseconds', COALESCE(COALESCE(client_confirmed_at, block_time), client_created_at), 'UTC')) DESC,
    id DESC
  );

CREATE INDEX idx_activities_protocol_event_time_feed
  ON activities (
    protocol,
    (date_trunc('milliseconds', COALESCE(COALESCE(client_confirmed_at, block_time), client_created_at), 'UTC')) DESC,
    id DESC
  );

CREATE INDEX idx_activities_chain_event_time_feed
  ON activities (
    chain_family,
    chain_id,
    (date_trunc('milliseconds', COALESCE(COALESCE(client_confirmed_at, block_time), client_created_at), 'UTC')) DESC,
    id DESC
  );

-- migrate:down
DROP INDEX idx_activities_chain_event_time_feed;
DROP INDEX idx_activities_protocol_event_time_feed;
DROP INDEX idx_activities_event_time_feed;
