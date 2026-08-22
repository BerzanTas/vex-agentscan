import type { EventKind, EventRole } from "./enums.js";

export const ROLES_BY_KIND: Record<EventKind, readonly EventRole[]> = {
  swap: ["swap", "trench_fee", "swap_fee"],
  bridge: [
    "bridge_deposit",
    "bridge_fee",
    "bridge_fill_expected",
    "bridge_fill_observed",
    "bridge_refund",
  ],
  lend: ["lend_deposit", "lend_withdraw", "lend_borrow_operate"],
  prediction: ["predict_buy", "predict_sell", "predict_claim", "predict_close"],
  wrap: ["wrap", "unwrap"],
  yield: [
    "yield_pt",
    "yield_yt",
    "yield_py",
    "yield_lp",
    "yield_sy",
    "yield_claim",
  ],
  launch: ["token_launch", "trench_fee", "pools_fee"],
  claim: ["pools_claim"],
  // A wallet-to-wallet send has one leg and one role. It is not a swap with a missing side: no
  // venue quotes it, nothing comes back, and the counterparty is deliberately not reported.
  transfer: ["wallet_transfer"],
};

// A pools.fun creator-fee claim settles as ONE row paying TWO assets: the launched token and the
// asset it was paired against. That is the same second-output-leg shape the Pendle split roles use,
// so the claim joins the allowlist rather than getting a second family of columns.
export const SECOND_LEG_ROLES: readonly EventRole[] = ["yield_py", "yield_lp", "pools_claim"];

// A claim spends nothing, so it carries no input leg on either side. Admitting one would be
// evidence the writer decoded the wrong transaction.
//
// wallet_transfer is deliberately absent from both lists above: a send SPENDS the input leg it
// reports, which is exactly why it could not ride the claim kind, and it settles as one leg, so a
// second leg on it would be evidence of a misread transaction.
export const INPUT_LEG_FORBIDDEN_ROLES: readonly EventRole[] = ["yield_claim", "pools_claim"];

// The mirror of the rule above. A send RECEIVES nothing: the tokens leave the agent's wallet and
// no leg comes back. An output leg on a wallet_transfer means the writer decoded a swap or a claim
// and filed it under the wrong role, so the contract refuses it rather than storing a row whose
// shape contradicts its own role.
export const OUTPUT_LEG_FORBIDDEN_ROLES: readonly EventRole[] = ["wallet_transfer"];

export function isRoleBoundToKind(kind: EventKind, eventRole: EventRole): boolean {
  return ROLES_BY_KIND[kind].includes(eventRole);
}
