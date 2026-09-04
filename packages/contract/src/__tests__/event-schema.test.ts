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
  launch: ["token_launch", "trench_fee", "pools_fee"],
  claim: ["pools_claim"],
  transfer: ["wallet_transfer"],
};

const boundPairs = Object.entries(boundRolesByKind).flatMap(([kind, roles]) =>
  roles.map((eventRole) => ({ kind, eventRole })),
);

const APPROVAL_ROLES = ["allowance", "allowance_reset"];

const approvalPairs = EVENT_KINDS.flatMap((kind) =>
  APPROVAL_ROLES.map((eventRole) => ({ kind, eventRole })),
);

const SECOND_LEG_ROLES: readonly string[] = ["yield_py", "yield_lp", "pools_claim"];

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
  it.each(boundPairs.filter(({ eventRole }) => !SECOND_LEG_ROLES.includes(eventRole)))(
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

// A pools.fun launch mints a token straight into a SushiSwap V3 pool on Robinhood Chain, so the
// creator's accrued fees are collected later by collectAndClaim, which pays the launched token AND
// the asset it was paired against in ONE transaction. That is a claim, not a launch: it opens no
// position and spends nothing, which is why it carries its own kind.
describe("eventSchema pools.fun launches, fees and claims (§4.2)", () => {
  const vexToken = { address: "0xnew", symbol: "VEX", decimals: 18 };
  const weth = { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18 };

  const poolsClaim = {
    ...legFreeEvent,
    protocol: "pools",
    kind: "claim",
    eventRole: "pools_claim",
    tokenOut: vexToken,
    amountOutRaw: "4100000000000000000000",
    executedOutRaw: "4100000000000000000000",
    tokenOut2: weth,
    amountOut2Raw: "31000000000000000",
    executedOut2Raw: "31000000000000000",
  };

  it("accepts a claim paying both the launched token and the paired asset", () => {
    expect(eventSchema.parse(poolsClaim)).toMatchObject({
      kind: "claim",
      eventRole: "pools_claim",
      executedOutRaw: "4100000000000000000000",
      executedOut2Raw: "31000000000000000",
    });
  });

  it("keeps each paid leg's own decimals, so neither amount can be read at the other's scale", () => {
    expect(eventSchema.parse(poolsClaim)).toMatchObject({
      tokenOut: { decimals: 18 },
      tokenOut2: { decimals: 18 },
    });
  });

  it("rejects a claim carrying a first input leg, which would prove the wrong transaction was read", () => {
    expect(() => eventSchema.parse({ ...poolsClaim, tokenIn: weth, amountInRaw: "1" })).toThrow();
  });

  it("rejects a claim carrying a second input leg for the same reason", () => {
    expect(() => eventSchema.parse({ ...poolsClaim, tokenIn2: weth, amountIn2Raw: "1" })).toThrow();
  });

  it("rejects pools_claim on the launch kind, which the claim is deliberately no longer part of", () => {
    expect(() => eventSchema.parse({ ...poolsClaim, kind: "launch" })).toThrow();
  });

  it("accepts the vex integrator fee leg on a launch", () => {
    const poolsFee = {
      ...legFreeEvent,
      protocol: "pools",
      kind: "launch",
      eventRole: "pools_fee",
      tokenIn: weth,
      amountInRaw: "2500000000000000",
      executedInRaw: "2500000000000000",
    };
    expect(eventSchema.parse(poolsFee)).toMatchObject({ kind: "launch", eventRole: "pools_fee" });
  });

  it("rejects the fee leg on the claim kind, which pays no fee", () => {
    expect(() => eventSchema.parse({ ...legFreeEvent, kind: "claim", eventRole: "pools_fee" })).toThrow();
  });

  it("rejects trench_fee on the claim kind", () => {
    expect(() => eventSchema.parse({ ...legFreeEvent, kind: "claim", eventRole: "trench_fee" })).toThrow();
  });
});

// An agent sending tokens out of its own wallet reports a transfer. It spends one leg and receives
// nothing, which is why it is neither a swap with a missing side nor a claim. The recipient is not
// part of the wire format at all: this server stores no counterparty address.
describe("eventSchema wallet transfers (§4.2)", () => {
  const usdc = { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6 };

  const walletTransfer = {
    ...legFreeEvent,
    protocol: "wallet",
    kind: "transfer",
    eventRole: "wallet_transfer",
    tokenIn: usdc,
    amountInRaw: "25000000",
    executedInRaw: "25000000",
    usdInEst: "25.00",
    usdOutEst: null,
    txHash: "0xfeed",
  };

  it("accepts a send carrying the input leg it spent", () => {
    expect(eventSchema.parse(walletTransfer)).toMatchObject({
      kind: "transfer",
      eventRole: "wallet_transfer",
      status: "confirmed",
      executedInRaw: "25000000",
      txHash: "0xfeed",
    });
  });

  it("keeps the sent amount at the token's own decimals, never rescaled", () => {
    expect(eventSchema.parse(walletTransfer)).toMatchObject({ tokenIn: { decimals: 6 } });
  });

  it("leaves the output leg empty, because a send receives nothing", () => {
    expect(eventSchema.parse(walletTransfer)).toMatchObject({
      tokenOut: null,
      amountOutRaw: null,
      executedOutRaw: null,
    });
  });

  it("accepts a native send, whose input leg is the chain's own asset", () => {
    const nativeSend = {
      ...walletTransfer,
      tokenIn: { address: "native", symbol: "ETH", decimals: 18 },
      amountInRaw: "1000000000000000",
      executedInRaw: "1000000000000000",
    };
    expect(eventSchema.parse(nativeSend)).toMatchObject({ executedInRaw: "1000000000000000" });
  });

  it("rejects a send carrying an output token, which would prove a swap or a claim was filed as a send", () => {
    expect(() =>
      eventSchema.parse({ ...walletTransfer, tokenOut: usdc, amountOutRaw: "25000000" }),
    ).toThrow();
  });

  it("rejects a send carrying a requested output amount", () => {
    expect(() => eventSchema.parse({ ...walletTransfer, amountOutRaw: "1" })).toThrow();
  });

  it("rejects a send carrying an executed output amount", () => {
    expect(() => eventSchema.parse({ ...walletTransfer, executedOutRaw: "1" })).toThrow();
  });

  it("rejects a second leg on a send, which settles as one leg", () => {
    expect(() => eventSchema.parse({ ...walletTransfer, ...secondLegOut })).toThrow();
  });

  it("rejects wallet_transfer on the claim kind, whose roles must spend nothing", () => {
    expect(() => eventSchema.parse({ ...legFreeEvent, kind: "claim", eventRole: "wallet_transfer" })).toThrow();
  });

  it("rejects wallet_transfer on a swap", () => {
    expect(() => eventSchema.parse({ ...legFreeEvent, kind: "swap", eventRole: "wallet_transfer" })).toThrow();
  });

  it("rejects the swap role on the transfer kind", () => {
    expect(() => eventSchema.parse({ ...legFreeEvent, kind: "transfer", eventRole: "swap" })).toThrow();
  });

  it("strips a smuggled recipient, because no counterparty crosses this wire", () => {
    const parsed = eventSchema.parse({ ...walletTransfer, toAddress: "0xrecipient" });
    expect("toAddress" in parsed).toBe(false);
  });
});

// One role, lend_borrow_operate, covers all four Morpho Blue market operations, the way it already
// covers the Solana borrow-operate rows. The operation is named in the client's own intent params,
// which this contract does not carry, so what crosses the wire is a single leg whose SIDE is the
// only thing that distinguishes a supply from a borrow.
describe("eventSchema Morpho Blue market operations (§4.2)", () => {
  const cbBtc = { address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", symbol: "cbBTC", decimals: 8 };
  const usdc = { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6 };
  const marketRow = { ...legFreeEvent, protocol: "morpho", kind: "lend", eventRole: "lend_borrow_operate" };

  const spent = (token: typeof usdc, raw: string) => ({
    ...marketRow,
    tokenIn: token,
    amountInRaw: raw,
    executedInRaw: raw,
  });
  const received = (token: typeof usdc, raw: string) => ({
    ...marketRow,
    tokenOut: token,
    amountOutRaw: raw,
    executedOutRaw: raw,
  });

  it("accepts a collateral supply, which carries only the spent collateral", () => {
    expect(eventSchema.parse(spent(cbBtc, "234"))).toMatchObject({
      executedInRaw: "234",
      executedOutRaw: null,
      tokenOut: null,
    });
  });

  it("accepts a borrow, which carries only the loan asset it received", () => {
    expect(eventSchema.parse(received(usdc, "50000"))).toMatchObject({
      executedOutRaw: "50000",
      executedInRaw: null,
      tokenIn: null,
    });
  });

  it("accepts a repayment, which carries only the loan asset it spent", () => {
    expect(eventSchema.parse(spent(usdc, "50001"))).toMatchObject({ executedInRaw: "50001" });
  });

  it("accepts a collateral withdrawal, which carries only the collateral it received", () => {
    expect(eventSchema.parse(received(cbBtc, "234"))).toMatchObject({ executedOutRaw: "234" });
  });

  it("keeps each leg's own decimals, which the two tokens of a market do not share", () => {
    expect(eventSchema.parse(spent(cbBtc, "234"))).toMatchObject({ tokenIn: { decimals: 8 } });
    expect(eventSchema.parse(received(usdc, "50000"))).toMatchObject({ tokenOut: { decimals: 6 } });
  });

  it("rejects a market operation on any kind other than lend", () => {
    expect(() => eventSchema.parse({ ...spent(cbBtc, "234"), kind: "yield" })).toThrow();
  });
});

describe("eventSchema Merkl reward claims (§4.2)", () => {
  const morphoClaim = {
    ...legFreeEvent,
    protocol: "morpho",
    kind: "yield",
    eventRole: "yield_claim",
    tokenOut: { address: "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842", symbol: "MORPHO", decimals: 18 },
    amountOutRaw: "4182300000000000000",
    executedOutRaw: "4182300000000000000",
  };

  it("accepts a morpho claim on the same terms as a pendle one", () => {
    expect(eventSchema.parse(morphoClaim)).toMatchObject({
      protocol: "morpho",
      eventRole: "yield_claim",
      executedInRaw: null,
    });
  });

  it("rejects a claim carrying an input leg, whatever protocol pays it", () => {
    const withInput = { ...morphoClaim, tokenIn: { address: "0xdead", symbol: "X", decimals: 18 } };
    expect(() => eventSchema.parse(withInput)).toThrow();
  });

  // A claim can pay several tokens in one transaction. The contract anchors one of them as the leg;
  // the second-leg fields belong to the yield PY/LP pair roles and stay closed here.
  it("rejects a second reward token on the claim row", () => {
    expect(() => eventSchema.parse({ ...morphoClaim, ...secondLegOut })).toThrow();
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
