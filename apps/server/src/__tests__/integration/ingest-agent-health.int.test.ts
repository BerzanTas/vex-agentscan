import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveChain, type ChainReader, type ReceiptView } from "@agentscan/core";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { runVerificationPass, type VerificationLoopDeps } from "../../worker/loop.js";

const strikingToken = "F".repeat(43);
const quarantinedToken = "G".repeat(43);
const strikingAgentHash = "f".repeat(64);
const quarantinedAgentHash = "9".repeat(64);

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

const confirmedEvent = (sourceRowId: string) => ({
  sourceRowId,
  sourceExecutionId: "9021",
  eventIndex: 0,
  kind: "swap",
  eventRole: "swap",
  status: "confirmed",
  protocol: "kyberswap",
  chainFamily: "eip155",
  chainId: 8453,
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
});

const batchOf = (events: unknown[], overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  agentHash: strikingAgentHash,
  backfill: true,
  events,
  ...overrides,
});

const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests" });

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

const revertedReceipt: ReceiptView = {
  status: "reverted",
  blockTimestamp: new Date(),
  erc20Transfers: [],
};

const revertedReader: ChainReader = {
  getReceipt: () => Promise.resolve(revertedReceipt),
};

const verificationDeps = (): VerificationLoopDeps => ({
  pool: db.pool,
  config,
  now: () => new Date(),
  resolveChain,
  chainReaderFor: () => revertedReader,
  logger: pino({ level: "silent" }),
});

beforeAll(async () => {
  db = await startTestDb();
  app = await buildApp({ pool: db.pool, config, resolveChain: () => null });
  const seedAgent = (agentHash: string, token: string, status: string) =>
    db.pool.query(
      `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status)
       VALUES ($1, $2, 1, now(), $3)`,
      [agentHash, sha256hex(token), status],
    );
  await seedAgent(strikingAgentHash, strikingToken, "active");
  await seedAgent(quarantinedAgentHash, quarantinedToken, "quarantined");
});

afterAll(async () => {
  await app.close();
  await db.stop();
});

const postEvents = (bearer: string, payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/v1/events",
    headers: { authorization: `Bearer ${bearer}` },
    payload: payload as object,
  });

describe("agent health in the ingest response", () => {
  it("reports zero strikes and active status for a fresh agent", async () => {
    const response = await postEvents(strikingToken, batchOf([]));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      accepted: 0,
      duplicates: 0,
      rejected: [],
      agent: { strikeCount: 0, status: "active" },
    });
  });

  it("reports the incremented strike count on the next ingest after a strike is recorded", async () => {
    const ingested = await postEvents(strikingToken, batchOf([confirmedEvent("strike-r1")]));
    expect(ingested.statusCode).toBe(200);
    expect(ingested.json()).toEqual({
      accepted: 1,
      duplicates: 0,
      rejected: [],
      agent: { strikeCount: 0, status: "active" },
    });

    const processed = await runVerificationPass(verificationDeps());
    expect(processed).toBe(1);

    const afterStrike = await postEvents(strikingToken, batchOf([]));
    expect(afterStrike.statusCode).toBe(200);
    expect(afterStrike.json()).toEqual({
      accepted: 0,
      duplicates: 0,
      rejected: [],
      agent: { strikeCount: 1, status: "active" },
    });
  });

  it("keeps the plain 403 quarantined error envelope without any agent field", async () => {
    const response = await postEvents(
      quarantinedToken,
      batchOf([], { agentHash: quarantinedAgentHash }),
    );
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: { code: "quarantined", message: "agent is quarantined" },
    });
  });
});
