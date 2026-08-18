import { describe, expect, it } from "vitest";
import { legLabel, roleLabel } from "../leg-label";

const pair = { eventRole: "swap", tokenInSymbol: "ETH", tokenOutSymbol: "VEX" };

describe("legLabel on a two-leg row", () => {
  it("keeps the feed's spaced arrow", () => {
    expect(legLabel(pair, " → ")).toBe("ETH → VEX");
  });

  it("keeps the detail page's tight arrow", () => {
    expect(legLabel(pair, "→")).toBe("ETH→VEX");
  });
});

// The four Morpho Blue market operations all arrive as lend_borrow_operate, so the role names none
// of them. The side the row populates does.
describe("legLabel on a single-leg row", () => {
  const marketRow = { eventRole: "lend_borrow_operate", tokenInSymbol: null, tokenOutSymbol: null };

  it("names the collateral a supply spent", () => {
    expect(legLabel({ ...marketRow, tokenInSymbol: "cbBTC" }, " → ")).toBe("cbBTC in");
  });

  it("names the loan asset a borrow received", () => {
    expect(legLabel({ ...marketRow, tokenOutSymbol: "USDC" }, " → ")).toBe("USDC out");
  });

  it("names the loan asset a repayment spent", () => {
    expect(legLabel({ ...marketRow, tokenInSymbol: "USDC" }, " → ")).toBe("USDC in");
  });

  it("names the collateral a withdrawal received", () => {
    expect(legLabel({ ...marketRow, tokenOutSymbol: "cbBTC" }, " → ")).toBe("cbBTC out");
  });

  it("tells two operations of the same role apart", () => {
    const supply = legLabel({ ...marketRow, tokenInSymbol: "cbBTC" }, " → ");
    const withdraw = legLabel({ ...marketRow, tokenOutSymbol: "cbBTC" }, " → ");

    expect(supply).not.toBe(withdraw);
  });

  it("names the reward token a claim credited", () => {
    const claim = { eventRole: "yield_claim", tokenInSymbol: null, tokenOutSymbol: "MORPHO" };

    expect(legLabel(claim, " → ")).toBe("MORPHO out");
  });

  it("falls back to the role when the row names no token at all", () => {
    expect(legLabel(marketRow, " → ")).toBe("lend borrow operate");
  });
});

describe("roleLabel", () => {
  it("reads a role as words rather than an identifier", () => {
    expect(roleLabel("bridge_fill_observed")).toBe("bridge fill observed");
  });
});
