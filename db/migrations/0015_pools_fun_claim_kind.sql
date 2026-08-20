-- migrate:up
-- pools.fun is a SushiSwap V3 launchpad on Robinhood Chain (4663). A launch mints a token straight
-- into a pool, and the creator later collects the accrued fees. Two things arrive that the
-- vocabulary could not name.
--
-- 'claim' is a NEW KIND, not merely a new role. A creator-fee collection is neither a launch nor a
-- trade: it opens no position, spends nothing, and pays two assets at once. Filing it under 'launch'
-- would make the launch kind mean two different events, and every surface that filters by kind
-- would have to re-split them by role afterwards.
--
-- 'pools_fee' is Vex's integrator fee on a pools.fun launch and rides the existing 'launch' kind
-- beside 'trench_fee'. It cannot reuse 'trench_fee': that role names a different venue, and the
-- populations selected by it answer "what did Trench earn".
--
-- Expand-only. Both CHECK constraints are restated in full because a CHECK cannot be extended in
-- place; every existing member is carried across unchanged.
ALTER TABLE activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE activities ADD CONSTRAINT activities_kind_check
  CHECK (kind IN ('swap','bridge','lend','prediction','wrap','yield','launch','claim'));

ALTER TABLE activities DROP CONSTRAINT activities_event_role_check;
ALTER TABLE activities ADD CONSTRAINT activities_event_role_check
  CHECK (event_role IN (
    'swap','trench_fee','swap_fee',
    'bridge_deposit','bridge_fee','bridge_fill_expected','bridge_fill_observed','bridge_refund',
    'lend_deposit','lend_withdraw','lend_borrow_operate',
    'predict_buy','predict_sell','predict_claim','predict_close',
    'wrap','unwrap',
    'yield_pt','yield_yt','yield_py','yield_lp','yield_sy','yield_claim',
    'token_launch',
    'pools_fee','pools_claim'
  ));

-- migrate:down
ALTER TABLE activities DROP CONSTRAINT activities_event_role_check;
ALTER TABLE activities ADD CONSTRAINT activities_event_role_check
  CHECK (event_role IN (
    'swap','trench_fee','swap_fee',
    'bridge_deposit','bridge_fee','bridge_fill_expected','bridge_fill_observed','bridge_refund',
    'lend_deposit','lend_withdraw','lend_borrow_operate',
    'predict_buy','predict_sell','predict_claim','predict_close',
    'wrap','unwrap',
    'yield_pt','yield_yt','yield_py','yield_lp','yield_sy','yield_claim',
    'token_launch'
  ));

ALTER TABLE activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE activities ADD CONSTRAINT activities_kind_check
  CHECK (kind IN ('swap','bridge','lend','prediction','wrap','yield','launch'));
