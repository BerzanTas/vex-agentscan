import { describe, expect, it } from "vitest";
import {
  activeActivityFilterCount,
  activityFiltersToQuery,
  chainFilterOptions,
  parseActivityFilters,
  protocolFilterOptions,
  withActivityFilter,
} from "../activity-filters";

describe("parseActivityFilters", () => {
  it("keeps every dimension the contract allows", () => {
    const filters = parseActivityFilters({
      kind: "bridge",
      protocol: "relay",
      chain: "solana",
      status: "confirmed",
      verification: "verified_basic",
    });

    expect(filters).toEqual({
      kind: "bridge",
      protocol: "relay",
      chain: "solana",
      status: "confirmed",
      verification: "verified_basic",
    });
  });

  it("ignores an unknown value instead of failing", () => {
    const filters = parseActivityFilters({ kind: "teleport", status: "confirmed" });

    expect(filters).toEqual({ status: "confirmed" });
  });

  it("ignores verification=mismatch because those rows are never public", () => {
    const filters = parseActivityFilters({ verification: "mismatch" });

    expect(filters).toEqual({});
  });

  it("ignores an unknown parameter name", () => {
    const filters = parseActivityFilters({ agent: "alias-1", kind: "swap" });

    expect(filters).toEqual({ kind: "swap" });
  });

  it("ignores a blank open value", () => {
    const filters = parseActivityFilters({ protocol: "   ", chain: "" });

    expect(filters).toEqual({});
  });

  it("takes the first entry when a parameter repeats", () => {
    const filters = parseActivityFilters({ kind: ["bridge", "swap"] });

    expect(filters).toEqual({ kind: "bridge" });
  });
});

describe("activityFiltersToQuery", () => {
  it("produces an empty query for an empty set", () => {
    expect(activityFiltersToQuery({})).toBe("");
  });

  it("orders the keys the same way whatever order they were set in", () => {
    const query = activityFiltersToQuery({
      verification: "verified_full",
      chain: "base",
      kind: "swap",
      status: "pending",
      protocol: "kyberswap",
    });

    expect(query).toBe(
      "kind=swap&protocol=kyberswap&chain=base&status=pending&verification=verified_full",
    );
  });

  it("omits a dimension that is not set", () => {
    expect(activityFiltersToQuery({ chain: "arbitrum" })).toBe("chain=arbitrum");
  });

  it("round-trips through the parser", () => {
    const filters = { kind: "bridge", chain: "solana", verification: "pending" } as const;

    const query = activityFiltersToQuery(filters);

    expect(parseActivityFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual(filters);
  });
});

describe("withActivityFilter", () => {
  it("replaces the chosen dimension and keeps the others", () => {
    const filters = withActivityFilter({ kind: "swap", chain: "base" }, "chain", "arbitrum");

    expect(filters).toEqual({ kind: "swap", chain: "arbitrum" });
  });

  it("clears the dimension when the empty option is chosen", () => {
    const filters = withActivityFilter({ kind: "swap", chain: "base" }, "kind", "");

    expect(filters).toEqual({ chain: "base" });
  });
});

describe("activeActivityFilterCount", () => {
  it("counts nothing for an empty set", () => {
    expect(activeActivityFilterCount({})).toBe(0);
  });

  it("counts every dimension that is set", () => {
    expect(activeActivityFilterCount({ kind: "swap", protocol: "relay", chain: "base" })).toBe(3);
  });
});

describe("protocolFilterOptions", () => {
  it("offers every protocol the catalogue knows, sorted, not only the ones on this page", () => {
    const options = protocolFilterOptions([{ protocol: "relay" }, { protocol: "kyberswap" }]);

    expect(options).toEqual(["kyberswap", "relay"]);
  });

  it("keeps the selected protocol even when the catalogue lost it", () => {
    const options = protocolFilterOptions([{ protocol: "relay" }], "khalani");

    expect(options).toEqual(["khalani", "relay"]);
  });
});

describe("chainFilterOptions", () => {
  it("offers every registry chain, including ones with no activity yet", () => {
    const options = chainFilterOptions([
      { chainSlug: "base" },
      { chainSlug: "arbitrum" },
      { chainSlug: "solana" },
    ]);

    expect(options).toEqual(["arbitrum", "base", "solana"]);
  });

  it("keeps the selected chain even when the catalogue lost it", () => {
    const options = chainFilterOptions([{ chainSlug: "base" }], "optimism");

    expect(options).toEqual(["base", "optimism"]);
  });
});
