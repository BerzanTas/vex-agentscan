import { describe, expect, it } from "vitest";
import { BANNED_INGEST_FIELDS, EVENT_KINDS, EVENT_ROLES, eventSchema, eventsBatchSchema } from "../index.js";

const goldenEvent = {
  sourceRowId: "44210",
  sourceExecutionId: "9021",
  eventIndex: 0,
  kind: "swap",
  eventRole: "swap",
  status: "confirmed",
  protocol: "kyberswap",
  chainFamily: "eip155",
  chainId: 4663,
  fromChainId: null,
  toChainId: null,
  tokenIn: { address: "0xabc", symbol: "ETH", decimals: 18 },
  tokenOut: { address: "0xdef", symbol: "VEX", decimals: 18 },
  amountInRaw: "1000000000000000000",
  amountOutRaw: "2410000000000000000000",
  executedInRaw: "1000000000000000000",
  executedOutRaw: "2407113000000000000000",
  usdInEst: "3312.44",
  usdOutEst: "3305.12",
  usdFeeEst: "3.31",
  usdSource: "kyberswap_quote",
  txHash: "0x123",
  failureCode: null,
  createdAt: "2026-07-28T11:58:03.101Z",
  confirmedAt: "2026-07-28T11:58:41.940Z",
  observedAt: null,
};

const legFreeEvent = {
  ...goldenEvent,
  tokenIn: null,
  tokenOut: null,
  amountInRaw: null,
  amountOutRaw: null,
  executedInRaw: null,
  executedOutRaw: null,
};

const boundRolesByKind: Record<(typeof EVENT_KINDS)[number], readonly string[]> = {
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
  launch: ["token_launch", "trench_fee"],
};

const boundPairs = Object.entries(boundRolesByKind).flatMap(([kind, roles]) =>
  roles.map((eventRole) => ({ kind, eventRole })),
);

const APPROVAL_ROLES = ["allowance", "allowance_reset"];

const approvalPairs = EVENT_KINDS.flatMap((kind) =>
  APPROVAL_ROLES.map((eventRole) => ({ kind, eventRole })),
);

const secondLegOut = {
  tokenOut2: { address: "0xyt", symbol: "YT", decimals: 18 },
  amountOut2Raw: "5000000000000000000",
  executedOut2Raw: "5000000000000000000",
};

const yieldPyMint = { ...legFreeEvent, protocol: "pendle", kind: "yield", eventRole: "yield_py" };

describe("eventSchema", () => {
  it("accepts the contract §4.2 golden event", () => {
    expect(eventSchema.parse(goldenEvent)).toMatchObject({ sourceRowId: "44210" });
  });
  it("strips unknown fields instead of rejecting (tolerant reader)", () => {
    const parsed = eventSchema.parse({ ...goldenEvent, futureField: "x" });
    expect("futureField" in parsed).toBe(false);
  });
  it("strips every §6 hard-exclusion field", () => {
    const smuggled = Object.fromEntries(BANNED_INGEST_FIELDS.map((field) => [field, "leak"]));
    const parsed = eventSchema.parse({ ...goldenEvent, ...smuggled });
    expect(BANNED_INGEST_FIELDS.filter((field) => field in parsed)).toEqual([]);
  });
  it("rejects amounts that are not decimal strings", () => {
    expect(() => eventSchema.parse({ ...goldenEvent, amountInRaw: 100 })).toThrow();
  });
  it("batch schema has no event-count cap (413 is the route's job)", () => {
    const batch = { schemaVersion: 1, agentHash: "a".repeat(64), backfill: false, events: new Array(501).fill({}) };
    expect(eventsBatchSchema.parse(batch).events).toHaveLength(501);
  });
  it("accepts a v1 envelope", () => {
    const batch = { schemaVersion: 1, agentHash: "a".repeat(64), backfill: false, events: [] };
    expect(eventsBatchSchema.parse(batch).schemaVersion).toBe(1);
  });
  it("accepts a v2 envelope", () => {
    const batch = { schemaVersion: 2, agentHash: "a".repeat(64), backfill: false, events: [] };
    expect(eventsBatchSchema.parse(batch).schemaVersion).toBe(2);
  });
  it("accepts a v2 envelope carrying only swap events (v2 is a strict superset)", () => {
    const batch = { schemaVersion: 2, agentHash: "a".repeat(64), backfill: false, events: [goldenEvent] };
    expect(eventsBatchSchema.parse(batch).events).toHaveLength(1);
  });
  it("accepts a v3 envelope", () => {
    const batch = { schemaVersion: 3, agentHash: "a".repeat(64), backfill: false, events: [] };
    expect(eventsBatchSchema.parse(batch).schemaVersion).toBe(3);
  });
  it("rejects schemaVersion 4", () => {
    const batch = { schemaVersion: 4, agentHash: "a".repeat(64), backfill: false, events: [] };
    expect(() => eventsBatchSchema.parse(batch)).toThrow();
  });
  it("accepts a launch/token_launch event", () => {
    const launchEvent = { ...goldenEvent, kind: "launch", eventRole: "token_launch" };
    expect(eventSchema.parse(launchEvent)).toMatchObject({ kind: "launch", eventRole: "token_launch" });
  });
  it("still rejects a kind outside the seven of contract §4.2", () => {
    expect(() => eventSchema.parse({ ...goldenEvent, kind: "airdrop" })).toThrow();
  });
});

describe("eventSchema kind/role binding (§4.2)", () => {
  it.each(EVENT_KINDS)("accepts exactly the roles the binding table gives kind '%s'", (kind) => {
    const accepted = EVENT_ROLES.filter(
      (eventRole) => eventSchema.safeParse({ ...legFreeEvent, kind, eventRole }).success,
    );
    expect([...accepted].sort()).toEqual([...boundRolesByKind[kind]].sort());
  });
  it("accepts swap_fee on a swap", () => {
    expect(eventSchema.parse({ ...goldenEvent, eventRole: "swap_fee" })).toMatchObject({ eventRole: "swap_fee" });
  });
  it("rejects swap_fee on a lend event", () => {
    expect(() => eventSchema.parse({ ...legFreeEvent, kind: "lend", eventRole: "swap_fee" })).toThrow();
  });
  it("rejects token_launch on a swap event", () => {
    expect(() => eventSchema.parse({ ...legFreeEvent, kind: "swap", eventRole: "token_launch" })).toThrow();
  });
  it("rejects allowance on a wrap event", () => {
    expect(() => eventSchema.parse({ ...legFreeEvent, kind: "wrap", eventRole: "allowance" })).toThrow();
  });
});

describe("eventSchema approval-role exclusion (§4.2 does not send approvals, and daily_aggregates.tx_count is never recomputed)", () => {
  it.each(approvalPairs)("rejects $eventRole on a $kind event", ({ kind, eventRole }) => {
    expect(() => eventSchema.parse({ ...legFreeEvent, kind, eventRole })).toThrow();
  });
  it("keeps the approval roles out of the role vocabulary entirely", () => {
    const vocabulary: readonly string[] = EVENT_ROLES;
    expect(APPROVAL_ROLES.filter((eventRole) => vocabulary.includes(eventRole))).toEqual([]);
  });
});

describe("eventSchema status vocabulary (§4.2)", () => {
  it("accepts superseded_unproven as a terminal status", () => {
    const superseded = { ...goldenEvent, status: "superseded_unproven" };
    expect(eventSchema.parse(superseded)).toMatchObject({ status: "superseded_unproven" });
  });
  it("rejects superseded_unproven carrying a failureCode (it is not a failure)", () => {
    const superseded = { ...goldenEvent, status: "superseded_unproven", failureCode: "mined_revert" };
    expect(() => eventSchema.parse(superseded)).toThrow();
  });
  it("accepts solana_signature_expired as a failure code", () => {
    const failed = { ...goldenEvent, status: "definitively_failed", failureCode: "solana_signature_expired" };
    expect(eventSchema.parse(failed)).toMatchObject({ failureCode: "solana_signature_expired" });
  });
  it("accepts venue_unavailable as a failure code", () => {
    const failed = { ...goldenEvent, status: "definitively_failed", failureCode: "venue_unavailable" };
    expect(eventSchema.parse(failed)).toMatchObject({ failureCode: "venue_unavailable" });
  });
});

describe("eventSchema second leg (§4.2)", () => {
  it("accepts a second out leg on yield_py", () => {
    expect(eventSchema.parse({ ...yieldPyMint, ...secondLegOut })).toMatchObject({
      amountOut2Raw: "5000000000000000000",
    });
  });
  it("accepts a second in leg on yield_lp", () => {
    const yieldLp = {
      ...legFreeEvent,
      protocol: "pendle",
      kind: "yield",
      eventRole: "yield_lp",
      tokenIn2: { address: "0xpt", symbol: "PT", decimals: 18 },
      amountIn2Raw: "7000000000000000000",
      executedIn2Raw: "7000000000000000000",
    };
    expect(eventSchema.parse(yieldLp)).toMatchObject({ amountIn2Raw: "7000000000000000000" });
  });
  it.each(boundPairs.filter(({ eventRole }) => eventRole !== "yield_py" && eventRole !== "yield_lp"))(
    "rejects a second leg on $kind/$eventRole",
    ({ kind, eventRole }) => {
      expect(() => eventSchema.parse({ ...legFreeEvent, kind, eventRole, ...secondLegOut })).toThrow();
    },
  );
  it("rejects a second-leg amount whose token ref omits decimals", () => {
    const noDecimals = {
      ...yieldPyMint,
      tokenOut2: { address: "0xyt", symbol: "YT" },
      amountOut2Raw: "5000000000000000000",
    };
    expect(() => eventSchema.parse(noDecimals)).toThrow();
  });
  it("rejects a second-leg amount with no token ref at all", () => {
    expect(() => eventSchema.parse({ ...yieldPyMint, amountOut2Raw: "5000000000000000000" })).toThrow();
  });
  it("rejects a second-leg executed amount with no token ref at all", () => {
    expect(() => eventSchema.parse({ ...yieldPyMint, executedOut2Raw: "5000000000000000000" })).toThrow();
  });
});

describe("eventSchema yield_claim input leg (§4.2)", () => {
  const yieldClaim = {
    ...legFreeEvent,
    protocol: "pendle",
    kind: "yield",
    eventRole: "yield_claim",
    tokenOut: { address: "0xrew", symbol: "PENDLE", decimals: 18 },
    amountOutRaw: "1200000000000000000",
    executedOutRaw: "1200000000000000000",
  };
  it("accepts a claim that carries only an output leg", () => {
    expect(eventSchema.parse(yieldClaim)).toMatchObject({ eventRole: "yield_claim", executedInRaw: null });
  });
  it("rejects a claim carrying an input token", () => {
    const withInput = { ...yieldClaim, tokenIn: { address: "0xsy", symbol: "SY", decimals: 18 } };
    expect(() => eventSchema.parse(withInput)).toThrow();
  });
  it("rejects a claim carrying a requested input amount", () => {
    expect(() => eventSchema.parse({ ...yieldClaim, amountInRaw: "1" })).toThrow();
  });
  it("rejects a claim carrying an executed input amount", () => {
    expect(() => eventSchema.parse({ ...yieldClaim, executedInRaw: "1" })).toThrow();
  });
});

describe("eventSchema cost breakdown (§4.2)", () => {
  it("accepts the four client-supplied cost estimates alongside the deprecated usdFeeEst", () => {
    const withCosts = {
      ...goldenEvent,
      usdNetworkGasEst: "0.42",
      usdVenueFeeEst: "1.10",
      usdVexFeeEst: "0.75",
      usdDestinationPrepayEst: "2.00",
    };
    expect(eventSchema.parse(withCosts)).toMatchObject({
      usdFeeEst: "3.31",
      usdNetworkGasEst: "0.42",
      usdVenueFeeEst: "1.10",
      usdVexFeeEst: "0.75",
      usdDestinationPrepayEst: "2.00",
    });
  });
  it("defaults every cost estimate to null when absent", () => {
    expect(eventSchema.parse(goldenEvent)).toMatchObject({
      usdNetworkGasEst: null,
      usdVenueFeeEst: null,
      usdVexFeeEst: null,
      usdDestinationPrepayEst: null,
    });
  });
});
