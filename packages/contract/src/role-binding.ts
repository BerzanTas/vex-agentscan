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
};

// A pools.fun creator-fee claim settles as ONE row paying TWO assets: the launched token and the
// asset it was paired against. That is the same second-output-leg shape the Pendle split roles use,
// so the claim joins the allowlist rather than getting a second family of columns.
export const SECOND_LEG_ROLES: readonly EventRole[] = ["yield_py", "yield_lp", "pools_claim"];

// A claim spends nothing, so it carries no input leg on either side. Admitting one would be
// evidence the writer decoded the wrong transaction.
export const INPUT_LEG_FORBIDDEN_ROLES: readonly EventRole[] = ["yield_claim", "pools_claim"];

export function isRoleBoundToKind(kind: EventKind, eventRole: EventRole): boolean {
  return ROLES_BY_KIND[kind].includes(eventRole);
}
