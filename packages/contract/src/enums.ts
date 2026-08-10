export const EVENT_KINDS = ["swap", "bridge", "lend", "prediction", "wrap", "yield", "launch"] as const;
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
] as const;
export const EVENT_STATUSES = ["pending", "confirmed", "definitively_failed", "superseded_unproven"] as const;
export const CHAIN_FAMILIES = ["eip155", "solana"] as const;
export const FAILURE_CODES = ["route_not_found", "slippage", "deadline_expired", "insufficient_liquidity", "allowance_or_balance", "chain_unsupported", "simulation_reverted", "mined_revert", "broadcast_error", "confirmation_timeout", "unknown", "bridge_failed", "bridge_refunded", "solana_signature_expired"] as const;
export const BANNED_INGEST_FIELDS = ["wallet_address", "from_address", "session_id", "nonce", "failure_reason", "route_provenance"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type EventRole = (typeof EVENT_ROLES)[number];
export type FailureCode = (typeof FAILURE_CODES)[number];
export type ChainFamily = (typeof CHAIN_FAMILIES)[number];
