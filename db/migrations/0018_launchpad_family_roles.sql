-- migrate:up
-- THE LAUNCHPAD FAMILY, AND ONE VENUE-INDEPENDENT NAME FOR THE VEX FEE.
--
-- Five roles arrive together because they are one vocabulary decision (owner, 2026-09-04): the
-- launchpad surface is named by WHAT HAPPENED, not by which venue it happened at, so a second
-- launchpad does not mint a second copy of every role.
--
--   creator_fee_claim    the launch creator taking their share of the trading fees their token
--                        earned. Two assets: the launched token and the asset it was paired
--                        against, so it joins the second-leg roles.
--   holder_reward_claim  a holder taking their share of a token's reward stream. Same two-asset
--                        shape (token mode, paired mode, both mode).
--   reward_distribution  the PERMISSIONLESS call that pushes a distributor's accrued rewards out
--                        to every holder. The caller is paid nothing, which is why it is not a
--                        claim of theirs and why the verifier caps it at basic: there is no leg of
--                        the caller's to match against the receipt.
--   launch_cancel        the creator ending a launch before it goes live. It belongs to the launch
--                        kind: same operation, same contract, terminal move.
--   vex_fee              Vex's own integrator fee leg, named by who charged it rather than by
--                        where. The four venue-named fee roles (trench_fee, swap_fee, bridge_fee,
--                        pools_fee) stay for the rows already written under them.
--
-- WHICH KINDS ADMIT vex_fee: swap, bridge and launch, and no others. That mirrors the producer's
-- own kind/role binding (087_wallet_transaction_intents.sql), which admits a venue-named fee leg on
-- exactly those three arms. The producer's fourth fee role, tx_vex_fee, is NOT added here: it lives
-- on the producer's 'transaction' kind, and this contract has no such kind, so no row can arrive
-- carrying it.
--
-- SERVER FIRST. This migration deploys BEFORE any writer learns these names, so an installation
-- running the new client against an old server is refused by the ingest contract rather than
-- writing rows the table cannot hold.
--
-- Expand-only, no kind is added, and both CHECK constraints are restated in full because a CHECK
-- cannot be extended in place. Every existing member is carried across unchanged.
ALTER TABLE activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE activities ADD CONSTRAINT activities_kind_check
  CHECK (kind IN ('swap','bridge','lend','prediction','wrap','yield','launch','claim','transfer'));

ALTER TABLE activities DROP CONSTRAINT activities_event_role_check;
ALTER TABLE activities ADD CONSTRAINT activities_event_role_check
  CHECK (event_role IN (
    'swap','trench_fee','swap_fee',
    'bridge_deposit','bridge_fee','bridge_fill_expected','bridge_fill_observed','bridge_refund',
    'lend_deposit','lend_withdraw','lend_borrow_operate',
    'predict_buy','predict_sell','predict_claim','predict_close',
    'wrap','unwrap',
    'yield_pt','yield_yt','yield_py','yield_lp','yield_sy','yield_claim',
    'token_launch','launch_cancel',
    'pools_fee','pools_claim',
    'wallet_transfer',
    'creator_fee_claim','holder_reward_claim','reward_distribution',
    'vex_fee'
  ));

-- Spending nothing is a durable invariant of a claim, not merely how today's writer fills the row,
-- and the three new claim roles inherit it from pools_claim and yield_claim. A distribute spends
-- nothing either: distribute() moves the distributor's own accrued balance and takes nothing from
-- the caller but gas, which this ledger does not model as a leg. Adding the constraint cannot fail
-- on existing data: all three roles are new in this migration, so no row can carry them yet.
ALTER TABLE activities ADD CONSTRAINT activities_claim_family_has_no_input_leg
  CHECK (
    event_role NOT IN ('creator_fee_claim','holder_reward_claim','reward_distribution') OR (
      token_in_address IS NULL AND token_in_symbol IS NULL AND token_in_decimals IS NULL
      AND amount_in_raw IS NULL AND executed_in_raw IS NULL
      AND token_in2_address IS NULL AND token_in2_symbol IS NULL AND token_in2_decimals IS NULL
      AND amount_in2_raw IS NULL AND executed_in2_raw IS NULL
    )
  );

-- reward_distribution deliberately has no output-leg prohibition beside it: the DISTRIBUTED TOTAL
-- is a real fact about the transaction and the one amount a distribute has, so its amounts are
-- optional, never forbidden. What it must not claim is that the caller received it, and no column
-- here says that.

-- migrate:down
ALTER TABLE activities DROP CONSTRAINT activities_claim_family_has_no_input_leg;

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
    'pools_fee','pools_claim',
    'wallet_transfer'
  ));

ALTER TABLE activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE activities ADD CONSTRAINT activities_kind_check
  CHECK (kind IN ('swap','bridge','lend','prediction','wrap','yield','launch','claim','transfer'));
