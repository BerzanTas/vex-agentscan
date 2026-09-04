import { describe, expect, it } from "vitest";
import { EVENT_ROLES } from "@agentscan/contract";
import { CAPITAL_DEPLOYING_ROLES, deploysCapitalRole } from "@agentscan/core";

const CAPITAL_COMING_BACK_ROLES = [
  "lend_withdraw",
  "predict_sell",
  "predict_claim",
  "predict_close",
  "yield_claim",
  "pools_claim",
  // A creator taking the trading fees their token earned, and a holder taking the rewards a token
  // streamed to them, are both capital COMING BACK: nothing is deployed, a position already open
  // pays out. Counting them would double the volume of the launch that created the position.
  "creator_fee_claim",
  "holder_reward_claim",
];

const FEE_ROLES = ["swap_fee", "bridge_fee", "trench_fee", "pools_fee", "vex_fee"];

const BRIDGE_ARRIVAL_ROLES = ["bridge_fill_expected", "bridge_fill_observed", "bridge_refund"];

const DENOMINATION_CHANGING_ROLES = ["wrap", "unwrap"];

const ROLES_CARRYING_NO_DIRECTION = [
  "lend_borrow_operate",
  "yield_pt",
  "yield_yt",
  "yield_py",
  "yield_lp",
  "yield_sy",
];

const ROLES_WHOSE_SPEND_IS_CONFLATED_WITH_A_FEE = ["token_launch"];

// Cancelling a launch DEPLOYS nothing: it refunds what the launch had committed. Counting it as
// volume would let a launch and its own cancellation each book the same capital.
const ROLES_THAT_UNDO_A_DEPLOYMENT = ["launch_cancel"];

// A permissionless distribute moves the DISTRIBUTOR's accrued balance to the token's holders. The
// caller deploys nothing and receives nothing, so there is no capital of theirs to count.
const ROLES_PAYING_SOMEONE_OTHER_THAN_THE_CALLER = ["reward_distribution"];

// A wallet-to-wallet send moves capital without deploying any: the agent still holds what it sent,
// at another address. Counting it as volume would let one balance be moved back and forth to
// manufacture an arbitrary figure.
const ROLES_MOVING_CAPITAL_WITHOUT_DEPLOYING_IT = ["wallet_transfer"];

const ROLES_OUTSIDE_VOLUME = [
  ...CAPITAL_COMING_BACK_ROLES,
  ...FEE_ROLES,
  ...BRIDGE_ARRIVAL_ROLES,
  ...DENOMINATION_CHANGING_ROLES,
  ...ROLES_CARRYING_NO_DIRECTION,
  ...ROLES_WHOSE_SPEND_IS_CONFLATED_WITH_A_FEE,
  ...ROLES_MOVING_CAPITAL_WITHOUT_DEPLOYING_IT,
  ...ROLES_THAT_UNDO_A_DEPLOYMENT,
  ...ROLES_PAYING_SOMEONE_OTHER_THAN_THE_CALLER,
];

function alphabetical(roles: readonly string[]): string[] {
  return [...roles].sort();
}

describe("the volume role set against the contract's role vocabulary", () => {
  it("gives every one of the contract's roles a verdict", () => {
    expect(alphabetical([...CAPITAL_DEPLOYING_ROLES, ...ROLES_OUTSIDE_VOLUME])).toEqual(
      alphabetical(EVENT_ROLES),
    );
  });

  it("counts only the four roles that open a position", () => {
    expect(EVENT_ROLES.filter((role) => deploysCapitalRole(role))).toEqual([
      "swap",
      "bridge_deposit",
      "lend_deposit",
      "predict_buy",
    ]);
  });

  it("keeps returned capital, fees, bridge arrivals, wraps, directionless roles and launches out", () => {
    expect(alphabetical(EVENT_ROLES.filter((role) => !deploysCapitalRole(role)))).toEqual(
      alphabetical(ROLES_OUTSIDE_VOLUME),
    );
  });
});
