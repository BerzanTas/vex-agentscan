-- migrate:up
-- Verification already keyed the daily aggregate on the block timestamp when the client sent no
-- confirmation time (it computed client_confirmed_at ?? blockTimestamp in application code) and
-- then discarded that timestamp. The day was therefore right when it was written but impossible to
-- derive again afterwards: any later writer can only see client_confirmed_at and verified_at.
-- block_time persists the instant so every writer, now and later, derives the same day from the
-- same row through one expression:
--   (COALESCE(client_confirmed_at, block_time, verified_at) AT TIME ZONE 'utc')::date
ALTER TABLE activities ADD COLUMN block_time TIMESTAMPTZ;

-- volume_usd stays the client-estimate series it has always been and is never published again.
-- volume_usd_priced is the server-priced series every public USD aggregate reads from. It is
-- incremented once per activity, in the same transaction as the pricing CAS and only when that CAS
-- wins, because daily_aggregates are written incrementally and never recomputed from raw events --
-- an increment applied twice by a reclaimed lease would be permanent and invisible.
ALTER TABLE daily_aggregates ADD COLUMN volume_usd_priced NUMERIC NOT NULL DEFAULT 0;

-- An activity verified before this migration has block_time NULL forever; the block timestamp is
-- unrecoverable. If it also lacks client_confirmed_at, its volume_usd already sits on the block day
-- while the pricing lane would key its volume_usd_priced on the verification day -- two days for
-- one activity, permanently, since daily_aggregates are never recomputed. Abandon those rows from
-- the priced series instead: an unpriced row is a disclosed missing figure, which is the posture
-- the whole lane takes, and a wrong per-day figure is not. This statement is a cleanup, not the
-- guarantee: the release runs the migration job before it rolls the worker revision, so the
-- previous worker keeps finalising rows against this schema without stamping block_time until the
-- rollout completes, and they arrive after this has already run. What holds the invariant is the
-- lane, which terminates any claimed activity with no settlement time on sight, whenever and by
-- whatever code it was written. To see how many rows carry no settlement time at all:
--   SELECT count(*) FROM activities WHERE pricing_state = 'unpriced' AND client_confirmed_at IS NULL
--     AND block_time IS NULL AND verification_state IN ('verified_full','verified_basic');
-- The down migration cannot restore them: once block_time is dropped they are indistinguishable.
UPDATE activities
SET pricing_state = 'unpriced', pricing_next_attempt_at = NULL
WHERE verification_state IN ('verified_full','verified_basic')
  AND pricing_state = 'pending'
  AND client_confirmed_at IS NULL
  AND block_time IS NULL;

-- migrate:down
ALTER TABLE daily_aggregates DROP COLUMN volume_usd_priced;
ALTER TABLE activities DROP COLUMN block_time;
