import { describe, expect, it } from "vitest";
import { EVENT_ROLES } from "@agentscan/contract";
import { VEX_FEE_LEG_ROLES, isVexFeeLegRole, logicalRowIn, vexFeeLegRolesIn } from "@agentscan/core";

// Every role the contract can send is either the Vex fee leg of an action or an action of its own.
// A role added to the vocabulary without a verdict here fails this test rather than silently
// becoming a second entry on the public site.
const LOGICAL_ROW_ROLES = [
  "swap",
  "bridge_deposit",
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
  "pools_claim",
];

function alphabetical(roles: readonly string[]): string[] {
  return [...roles].sort();
}

describe("the Vex fee leg role set against the contract's role vocabulary", () => {
  it("gives every one of the contract's roles a verdict", () => {
    expect(alphabetical([...VEX_FEE_LEG_ROLES, ...LOGICAL_ROW_ROLES])).toEqual(
      alphabetical(EVENT_ROLES),
    );
  });

  it("names exactly the four roles that carry an integrator fee", () => {
    expect(EVENT_ROLES.filter((role) => isVexFeeLegRole(role))).toEqual([
      "trench_fee",
      "swap_fee",
      "bridge_fee",
      "pools_fee",
    ]);
  });

  it("treats every other role as an action of its own", () => {
    expect(alphabetical(EVENT_ROLES.filter((role) => !isVexFeeLegRole(role)))).toEqual(
      alphabetical(LOGICAL_ROW_ROLES),
    );
  });
});

describe("the SQL fragments the read model composes", () => {
  it("selects the fee legs and their complement over the same column", () => {
    expect(vexFeeLegRolesIn("a.event_role")).toBe(
      "a.event_role IN ('swap_fee','bridge_fee','trench_fee','pools_fee')",
    );
    expect(logicalRowIn("a.event_role")).toBe(
      "a.event_role NOT IN ('swap_fee','bridge_fee','trench_fee','pools_fee')",
    );
  });
});
