-- migrate:up
-- A Vex agent can send tokens from its own wallet to another address. Until now that event had no
-- name the contract would accept, so it never reached the explorer at all.
--
-- 'transfer' is a NEW KIND rather than a role on an existing one. It is not a swap with a missing
-- side: no venue quotes it, nothing comes back, and no position opens or closes. It is also not a
-- 'claim': a claim spends nothing, while a send SPENDS the leg it reports, which is precisely the
-- reason 'wallet_transfer' cannot ride the claim kind and its input-leg prohibition.
--
-- The counterparty is deliberately not part of the vocabulary. This server stores no recipient and
-- never will; verification matches the reported amount against the chain, not against an address.
--
-- Expand-only. Both CHECK constraints are restated in full because a CHECK cannot be extended in
-- place; every existing member is carried across unchanged.
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
    'token_launch',
    'pools_fee','pools_claim',
    'wallet_transfer'
  ));

-- Input-only is a durable invariant of the role, not merely how today's writer happens to fill the
-- row: a send receives nothing back. The wire contract refuses an output leg on a wallet_transfer,
-- and the table refuses to hold one, so a future writer cannot quietly file a swap or a claim under
-- the send role. Adding the constraint cannot fail on existing data: the role itself is new in this
-- migration, so no row can carry it yet.
ALTER TABLE activities ADD CONSTRAINT activities_wallet_transfer_has_no_output_leg
  CHECK (
    event_role <> 'wallet_transfer' OR (
      token_out_address IS NULL AND token_out_symbol IS NULL AND token_out_decimals IS NULL
      AND amount_out_raw IS NULL AND executed_out_raw IS NULL
      AND token_out2_address IS NULL AND token_out2_symbol IS NULL AND token_out2_decimals IS NULL
      AND amount_out2_raw IS NULL AND executed_out2_raw IS NULL
    )
  );

-- migrate:down
ALTER TABLE activities DROP CONSTRAINT activities_wallet_transfer_has_no_output_leg;

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

ALTER TABLE activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE activities ADD CONSTRAINT activities_kind_check
  CHECK (kind IN ('swap','bridge','lend','prediction','wrap','yield','launch','claim'));
