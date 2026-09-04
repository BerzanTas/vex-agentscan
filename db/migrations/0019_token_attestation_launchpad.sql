-- migrate:up
-- WHICH LAUNCHPAD A TOKEN ATTESTATION CLAIMS, AND THEREFORE WHICH PROOF THE VERIFIER APPLIES.
--
-- Until now the verifier decoded one creation event, Trench's `TokenCreated`, and one chain, 4663.
-- pools.fun proves a creator with `GatewayLaunch(token, pool, launcher, ...)` from one of three
-- gateway contracts, and Virtuals proves one with the creator's own `preLaunch` transaction, on two
-- chains. Those proofs are not interchangeable, so the claim has to say which one it is: running
-- every decoder over every receipt and accepting whichever matched would weaken the attestation to
-- "some allowlisted contract somewhere emitted something that looked right".
--
-- READER BEFORE WRITER. The column is NOT NULL with DEFAULT 'trench', so:
--   - every row already in the table becomes a Trench attestation, which is exactly what it is;
--   - a client that predates the field keeps working unchanged, because the wire field is optional
--     and defaults to the same value;
--   - the new server can be deployed before any client learns the field, which is the order this
--     arc requires.
--
-- The row identity is unchanged: (chain_id, token_address, recovered_signer) stays the unique key.
-- A token address on a chain belongs to exactly one launchpad, so the launchpad adds no identity;
-- it records which proof the submitter asked for. A resubmission for the same triple returns the
-- existing row's status, as it always has.
ALTER TABLE token_attestations
  ADD COLUMN launchpad TEXT NOT NULL DEFAULT 'trench';

ALTER TABLE token_attestations ADD CONSTRAINT token_attestations_launchpad_check
  CHECK (launchpad IN ('trench','pools_fun','virtuals'));

-- migrate:down
ALTER TABLE token_attestations DROP CONSTRAINT token_attestations_launchpad_check;
ALTER TABLE token_attestations DROP COLUMN launchpad;
