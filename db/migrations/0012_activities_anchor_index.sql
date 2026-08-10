-- migrate:up
-- Migration 0011 gave every writer one day key and the public reads followed it. Postgres matches
-- an expression index by structural equality, so the settlement anchor cannot use
-- idx_activities_verified_confirmed, which is built on the older two-term expression: every
-- windowed read on activities -- the live chart, the leaderboard, the protocol ranking, the
-- priced-coverage route, networks, routes and tokens -- degraded to a post-fetch filter the moment
-- the anchor moved.
--
-- The nesting below is load-bearing: activityTimeAnchorSql composes activitySettledAtSql, so the
-- expression Postgres sees is a COALESCE inside a COALESCE. The flat three-term form matches
-- nothing, and the failure is quiet -- the planner still opens this index for its partial predicate
-- and filters the anchor on the heap, which reads as a working index in EXPLAIN until you notice
-- there is no Index Cond. A test asserts this expression against activityTimeAnchorSql so the two
-- cannot drift apart again.
CREATE INDEX idx_activities_verified_anchor
  ON activities ((COALESCE(COALESCE(client_confirmed_at, block_time), verified_at)))
  WHERE verification_state IN ('verified_full', 'verified_basic');

-- Both superseded indexes are dropped rather than left behind: nothing reads the two-term
-- expression any more, and countActiveAgents7d was the only user of the bare client_confirmed_at
-- window before it moved onto the shared anchor. An unused index is write amplification on every
-- ingest for no read.
DROP INDEX idx_activities_verified_confirmed;
DROP INDEX idx_activities_verified_window;

-- migrate:down
CREATE INDEX idx_activities_verified_window
  ON activities (client_confirmed_at, agent_hash)
  WHERE verification_state IN ('verified_full', 'verified_basic');

CREATE INDEX idx_activities_verified_confirmed
  ON activities ((COALESCE(client_confirmed_at, verified_at)))
  WHERE verification_state IN ('verified_full', 'verified_basic');

DROP INDEX idx_activities_verified_anchor;
