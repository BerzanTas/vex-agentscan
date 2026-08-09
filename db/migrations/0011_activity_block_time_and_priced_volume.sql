-- migrate:up
-- Verification learns the on-chain block timestamp and then discards it, so an activity that
-- arrived without client_confirmed_at was aggregated under the day our worker happened to verify
-- it rather than the day it settled. block_time persists that instant so the day bucket, the
-- pricing hour bucket and the price we ask the feed for all key off the same moment. It is the
-- middle term of the one day-key expression every writer now shares:
--   (COALESCE(client_confirmed_at, block_time, verified_at) AT TIME ZONE 'utc')::date
ALTER TABLE activities ADD COLUMN block_time TIMESTAMPTZ;

-- volume_usd stays the client-estimate series it has always been and is never published again.
-- volume_usd_priced is the server-priced series every public USD aggregate reads from. It is
-- incremented once per activity, in the same transaction as the pricing CAS and only when that CAS
-- wins, because daily_aggregates are written incrementally and never recomputed from raw events —
-- an increment applied twice by a reclaimed lease would be permanent and invisible.
ALTER TABLE daily_aggregates ADD COLUMN volume_usd_priced NUMERIC NOT NULL DEFAULT 0;

-- migrate:down
ALTER TABLE daily_aggregates DROP COLUMN volume_usd_priced;
ALTER TABLE activities DROP COLUMN block_time;
