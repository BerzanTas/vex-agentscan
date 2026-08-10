import { describe, expect, it } from "vitest";
import {
  CAPITAL_DEPLOYING_ROLES,
  capitalDeployingRolesIn,
  deploysCapitalRole,
} from "../capital-deploying-roles.js";

describe("the roles whose rows mean capital deployed into a position", () => {
  it("is exactly swap, bridge_deposit, lend_deposit and predict_buy", () => {
    expect(CAPITAL_DEPLOYING_ROLES).toEqual(["swap", "bridge_deposit", "lend_deposit", "predict_buy"]);
  });

  it("admits a role that opens a position", () => {
    expect(deploysCapitalRole("lend_deposit")).toBe(true);
  });

  it("refuses the role that closes the position that role opened", () => {
    expect(deploysCapitalRole("lend_withdraw")).toBe(false);
  });

  it("refuses a role the contract does not define", () => {
    expect(deploysCapitalRole("deposit")).toBe(false);
  });
});

describe("rendering the set into SQL", () => {
  it("builds a membership test on an aliased activities column", () => {
    expect(capitalDeployingRolesIn("a.event_role")).toBe(
      "a.event_role IN ('swap','bridge_deposit','lend_deposit','predict_buy')",
    );
  });

  it("builds the same membership test on a bare column of a subquery", () => {
    expect(capitalDeployingRolesIn("event_role")).toBe(
      "event_role IN ('swap','bridge_deposit','lend_deposit','predict_buy')",
    );
  });
});
