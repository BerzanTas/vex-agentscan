import { describe, expect, it } from "vitest";
import { eventSchema, eventsBatchSchema } from "../index.js";

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

describe("eventSchema", () => {
  it("accepts the contract §4.2 golden event", () => {
    expect(eventSchema.parse(goldenEvent)).toMatchObject({ sourceRowId: "44210" });
  });
  it("strips unknown fields instead of rejecting (tolerant reader)", () => {
    const parsed = eventSchema.parse({ ...goldenEvent, futureField: "x" });
    expect("futureField" in parsed).toBe(false);
  });
  it("strips banned fields at schema level", () => {
    const parsed = eventSchema.parse({ ...goldenEvent, wallet_address: "0xevil" });
    expect("wallet_address" in parsed).toBe(false);
  });
  it("rejects allowance roles", () => {
    expect(() => eventSchema.parse({ ...goldenEvent, eventRole: "allowance" })).toThrow();
  });
  it("rejects amounts that are not decimal strings", () => {
    expect(() => eventSchema.parse({ ...goldenEvent, amountInRaw: 100 })).toThrow();
  });
  it("batch schema has no event-count cap (413 is the route's job)", () => {
    const batch = { schemaVersion: 1, agentHash: "a".repeat(64), backfill: false, events: new Array(501).fill({}) };
    expect(eventsBatchSchema.parse(batch).events).toHaveLength(501);
  });
});
