export const EVENT_KINDS = ["swap", "bridge", "lend", "prediction", "wrap", "yield", "launch", "claim", "transfer"] as const;
export const EVENT_ROLES = [
  "swap",
  "trench_fee",
  "swap_fee",
  "bridge_deposit",
  "bridge_fee",
  "bridge_fill_expected",
  "bridge_fill_observed",
  "bridge_refund",
  "lend_deposit",
  "lend_withdraw",
  "lend_borrow_operate",
  "predict_buy",
  "predict_sell",
  "predict_claim",
  "predict_close",
  "wrap",
  "unwrap",
  "yield_pt",
  "yield_yt",
  "yield_py",
  "yield_lp",
  "yield_sy",
  "yield_claim",
  "token_launch",
  "pools_fee",
  "pools_claim",
  "wallet_transfer",
  // The launchpad family (2026-09-04). A creator claiming the fees their launched token earned,
  // a holder claiming the rewards a token streams to its holders, the permissionless call that
  // pushes those rewards out to everyone, and the creator abandoning a launch before it goes live.
  // Venue-named roles (trench_fee, pools_fee, pools_claim) stay for the history already written.
  "creator_fee_claim",
  "holder_reward_claim",
  "reward_distribution",
  "launch_cancel",
  // The venue-independent name for Vex's own integrator fee leg. The venue-named fee roles
  // (swap_fee, bridge_fee, trench_fee, pools_fee) each say WHERE the fee was taken; this one says
  // only that Vex charged it, which is what a new venue needs and all the read model ever asks.
  "vex_fee",
] as const;
export const EVENT_STATUSES = ["pending", "confirmed", "definitively_failed", "superseded_unproven"] as const;
export const CHAIN_FAMILIES = ["eip155", "solana"] as const;
export const FAILURE_CODES = ["route_not_found", "slippage", "deadline_expired", "insufficient_liquidity", "allowance_or_balance", "chain_unsupported", "simulation_reverted", "mined_revert", "broadcast_error", "confirmation_timeout", "unknown", "bridge_failed", "bridge_refunded", "solana_signature_expired", "venue_unavailable"] as const;
export const BANNED_INGEST_FIELDS = ["wallet_address", "from_address", "session_id", "nonce", "failure_reason", "route_provenance"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type EventRole = (typeof EVENT_ROLES)[number];
export type FailureCode = (typeof FAILURE_CODES)[number];
export type ChainFamily = (typeof CHAIN_FAMILIES)[number];
