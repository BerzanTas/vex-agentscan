-- migrate:up
ALTER TABLE activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE activities ADD CONSTRAINT activities_kind_check
  CHECK (kind IN ('swap','bridge','lend','prediction','wrap','yield','launch'));

-- The approval roles (allowance, allowance_reset) are deliberately absent: contract §4.2 does not
-- send them, and daily_aggregates.tx_count is written incrementally and never recomputed, so an
-- ingested approval would permanently redefine the published transaction count as "operations plus
-- approvals". Admitting them later is a migration; un-counting them is not.
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

-- superseded_unproven is terminal and is NOT a failure: it asserts only that the hash is no longer
-- tracked in flight and its inclusion outcome is unproven. It carries no failure_code and no surface
-- may render it as an error.
ALTER TABLE activities DROP CONSTRAINT activities_status_check;
ALTER TABLE activities ADD CONSTRAINT activities_status_check
  CHECK (status IN ('pending','confirmed','definitively_failed','superseded_unproven'));

ALTER TABLE activities
  ADD COLUMN token_in2_address TEXT,
  ADD COLUMN token_in2_symbol TEXT,
  ADD COLUMN token_in2_decimals SMALLINT,
  ADD COLUMN token_out2_address TEXT,
  ADD COLUMN token_out2_symbol TEXT,
  ADD COLUMN token_out2_decimals SMALLINT,
  ADD COLUMN amount_in2_raw TEXT,
  ADD COLUMN amount_out2_raw TEXT,
  ADD COLUMN executed_in2_raw TEXT,
  ADD COLUMN executed_out2_raw TEXT,
  ADD COLUMN usd_network_gas_est NUMERIC,
  ADD COLUMN usd_venue_fee_est NUMERIC,
  ADD COLUMN usd_vex_fee_est NUMERIC,
  ADD COLUMN usd_destination_prepay_est NUMERIC;

-- A raw amount with no decimals cannot be scaled by anyone; storing one is the canonical
-- thousandfold error. A writer that cannot read a second leg's decimals must leave that leg's raw
-- amount NULL instead.
ALTER TABLE activities ADD CONSTRAINT activities_second_leg_in_amount_has_token
  CHECK (
    (amount_in2_raw IS NULL AND executed_in2_raw IS NULL)
    OR (token_in2_address IS NOT NULL AND token_in2_decimals IS NOT NULL)
  );

ALTER TABLE activities ADD CONSTRAINT activities_second_leg_out_amount_has_token
  CHECK (
    (amount_out2_raw IS NULL AND executed_out2_raw IS NULL)
    OR (token_out2_address IS NOT NULL AND token_out2_decimals IS NOT NULL)
  );

-- migrate:down
ALTER TABLE activities DROP CONSTRAINT activities_second_leg_out_amount_has_token;
ALTER TABLE activities DROP CONSTRAINT activities_second_leg_in_amount_has_token;

ALTER TABLE activities
  DROP COLUMN usd_destination_prepay_est,
  DROP COLUMN usd_vex_fee_est,
  DROP COLUMN usd_venue_fee_est,
  DROP COLUMN usd_network_gas_est,
  DROP COLUMN executed_out2_raw,
  DROP COLUMN executed_in2_raw,
  DROP COLUMN amount_out2_raw,
  DROP COLUMN amount_in2_raw,
  DROP COLUMN token_out2_decimals,
  DROP COLUMN token_out2_symbol,
  DROP COLUMN token_out2_address,
  DROP COLUMN token_in2_decimals,
  DROP COLUMN token_in2_symbol,
  DROP COLUMN token_in2_address;

ALTER TABLE activities DROP CONSTRAINT activities_status_check;
ALTER TABLE activities ADD CONSTRAINT activities_status_check
  CHECK (status IN ('pending','confirmed','definitively_failed'));

ALTER TABLE activities DROP CONSTRAINT activities_event_role_check;
ALTER TABLE activities ADD CONSTRAINT activities_event_role_check
  CHECK (event_role IN ('swap','bridge_deposit','bridge_fill_expected','bridge_fill_observed','bridge_refund','token_launch'));

ALTER TABLE activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE activities ADD CONSTRAINT activities_kind_check CHECK (kind IN ('swap','bridge','launch'));
