import type { EventKind, EventRole } from "./enums.js";

// WHICH KINDS ADMIT `vex_fee`, AND WHY EXACTLY THOSE THREE.
//
// The producer's own kind/role binding (`src/vex-agent/db/migrations/087_wallet_transaction_intents.sql`,
// the `agent_activity_kind_role_binding` CHECK) admits a venue-named fee leg on three arms and no
// others: swap (`trench_fee`, `swap_fee`), bridge (`bridge_fee`) and launch (`trench_fee`,
// `pools_fee`). `lend`, `yield`, `prediction`, `wrap`, `claim` and `transfer` carry no fee role
// there, so admitting one here would be the server inventing an arm the writer cannot produce.
// `vex_fee` therefore joins exactly the swap, bridge and launch arms. The producer's fourth fee
// role, `tx_vex_fee`, is deliberately NOT mirrored: it belongs to the producer's `transaction`
// kind, which this contract does not have.
export const ROLES_BY_KIND: Record<EventKind, readonly EventRole[]> = {
  swap: ["swap", "trench_fee", "swap_fee", "vex_fee"],
  bridge: [
    "bridge_deposit",
    "bridge_fee",
    "bridge_fill_expected",
    "bridge_fill_observed",
    "bridge_refund",
    "vex_fee",
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
  // `launch_cancel` is a launch that the creator ended before it went live. It belongs to the
  // launch kind because it is the same operation's terminal move on the same contract, and the
  // refund it produces is the only leg it carries.
  launch: ["token_launch", "launch_cancel", "trench_fee", "pools_fee", "vex_fee"],
  // The claim family by what is being claimed rather than by the venue that pays it:
  // `creator_fee_claim` (the launch creator's share of trading fees), `holder_reward_claim` (a
  // holder's share of a token's reward stream) and `reward_distribution` (the permissionless call
  // that pushes a distributor's accrued rewards out to every holder). `pools_claim` stays for the
  // rows already written under it.
  claim: ["pools_claim", "creator_fee_claim", "holder_reward_claim", "reward_distribution"],
  // A wallet-to-wallet send has one leg and one role. It is not a swap with a missing side: no
  // venue quotes it, nothing comes back, and the counterparty is deliberately not reported.
  transfer: ["wallet_transfer"],
};

// A pools.fun creator-fee claim settles as ONE row paying TWO assets: the launched token and the
// asset it was paired against. That is the same second-output-leg shape the Pendle split roles use,
// so the claim joins the allowlist rather than getting a second family of columns.
// `creator_fee_claim` and `holder_reward_claim` join for the same reason `pools_claim` did: a
// creator claim pays the launched token AND the asset it was paired against, and a holder-reward
// claim has a paired mode and a both mode that do the same. `reward_distribution` is absent: the
// caller is paid nothing, so a second leg on it would be evidence of a misread transaction.
export const SECOND_LEG_ROLES: readonly EventRole[] = [
  "yield_py",
  "yield_lp",
  "pools_claim",
  "creator_fee_claim",
  "holder_reward_claim",
];

// A claim spends nothing, so it carries no input leg on either side. Admitting one would be
// evidence the writer decoded the wrong transaction.
//
// wallet_transfer is deliberately absent from both lists above: a send SPENDS the input leg it
// reports, which is exactly why it could not ride the claim kind, and it settles as one leg, so a
// second leg on it would be evidence of a misread transaction.
// Every claim-kind role spends nothing, including the permissionless distribute: `distribute()`
// moves the distributor's own accrued balance to the holders and takes nothing from the caller but
// gas, which this ledger does not model as a leg.
export const INPUT_LEG_FORBIDDEN_ROLES: readonly EventRole[] = [
  "yield_claim",
  "pools_claim",
  "creator_fee_claim",
  "holder_reward_claim",
  "reward_distribution",
];

// The mirror of the rule above. A send RECEIVES nothing: the tokens leave the agent's wallet and
// no leg comes back. An output leg on a wallet_transfer means the writer decoded a swap or a claim
// and filed it under the wrong role, so the contract refuses it rather than storing a row whose
// shape contradicts its own role.
//
// `reward_distribution` is deliberately NOT here even though the caller receives nothing: the
// distributed total is a real fact about the transaction the writer may choose to record, and it
// is the one amount a distribute has. Its amounts are optional, not forbidden.
export const OUTPUT_LEG_FORBIDDEN_ROLES: readonly EventRole[] = ["wallet_transfer"];

export function isRoleBoundToKind(kind: EventKind, eventRole: EventRole): boolean {
  return ROLES_BY_KIND[kind].includes(eventRole);
}
