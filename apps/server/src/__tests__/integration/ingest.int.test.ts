import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";

const activeToken = "A".repeat(43);
const revokedToken = "C".repeat(43);
const quarantinedToken = "D".repeat(43);
const rateLimitedToken = "E".repeat(43);
const unknownToken = "Z".repeat(43);
const activeAgentHash = "a".repeat(64);
const foreignAgentHash = "b".repeat(64);
const revokedAgentHash = "c".repeat(64);
const quarantinedAgentHash = "d".repeat(64);
const rateLimitedAgentHash = "e".repeat(64);
const walletValue = "0xSECRETWALLETVALUE";
const rateLimit = 30;
const maxBatchEvents = 10;

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

const goldenEvent = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

const pendingEvent = (sourceRowId: string) =>
  goldenEvent({
    sourceRowId,
    status: "pending",
    txHash: null,
    confirmedAt: null,
    executedInRaw: null,
    executedOutRaw: null,
  });

const batchOf = (events: unknown[], overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  agentHash: activeAgentHash,
  backfill: false,
  events,
  ...overrides,
});

const logLines: string[] = [];

type PinoDestination = { write: (line: string) => unknown };

function captureLogLines(app: FastifyInstance): void {
  const holder = app.log as unknown as Record<symbol, PinoDestination | undefined>;
  const destination = holder[pino.symbols.streamSym];
  if (destination === undefined) throw new Error("pino destination stream not found");
  const originalWrite = destination.write.bind(destination);
  destination.write = (line: string) => {
    logLines.push(line);
    return originalWrite(line);
  };
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  db = await startTestDb();
  const config = loadConfig({
    DATABASE_URL: "postgres://unused-in-tests",
    MAX_BATCH_EVENTS: String(maxBatchEvents),
    MAX_BODY_BYTES: "16384",
    INGEST_RATE_LIMIT_PER_TOKEN: String(rateLimit),
    INGEST_RATE_WINDOW_SEC: "60",
  });
  app = await buildApp({ pool: db.pool, config, resolveChain: () => null });
  captureLogLines(app);
  const seedAgent = (agentHash: string, token: string, status: string) =>
    db.pool.query(
      `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status)
       VALUES ($1, $2, 1, now(), $3)`,
      [agentHash, sha256hex(token), status],
    );
  await seedAgent(activeAgentHash, activeToken, "active");
  await seedAgent(revokedAgentHash, revokedToken, "revoked");
  await seedAgent(quarantinedAgentHash, quarantinedToken, "quarantined");
  await seedAgent(rateLimitedAgentHash, rateLimitedToken, "active");
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

const activityRow = async (sourceRowId: string) => {
  const result = await db.pool.query(
    "SELECT * FROM activities WHERE agent_hash = $1 AND source_row_id = $2",
    [activeAgentHash, sourceRowId],
  );
  return result.rows[0];
};

const verificationJobRow = async (activityId: string) => {
  const result = await db.pool.query(
    "SELECT * FROM verification_jobs WHERE activity_id = $1",
    [activityId],
  );
  return result.rows[0];
};

describe("POST /v1/events", () => {
  it("rejects an unknown token with 401 unauthorized", async () => {
    const response = await postEvents(unknownToken, batchOf([]));
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("unauthorized");
  });

  it("rejects a valid token carrying a foreign agentHash with 403 not_registered", async () => {
    const response = await postEvents(activeToken, batchOf([], { agentHash: foreignAgentHash }));
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("not_registered");
  });

  it("rejects a revoked agent with 410 consent_revoked before body validation", async () => {
    const response = await postEvents(revokedToken, { events: "deliberately broken" });
    expect(response.statusCode).toBe(410);
    expect(response.json().error.code).toBe("consent_revoked");
  });

  it("rejects a quarantined agent with 403 quarantined", async () => {
    const response = await postEvents(
      quarantinedToken,
      batchOf([], { agentHash: quarantinedAgentHash }),
    );
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("quarantined");
  });

  it("rejects a batch above MAX_BATCH_EVENTS with 413 payload_too_large before per-event validation", async () => {
    const oversizedBatch = batchOf(Array.from({ length: maxBatchEvents + 1 }, () => ({})));
    const response = await postEvents(activeToken, oversizedBatch);
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("payload_too_large");
  });

  it("rejects a body above MAX_BODY_BYTES with 413 payload_too_large", async () => {
    const response = await postEvents(activeToken, { filler: "x".repeat(20000) });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("payload_too_large");
  });

  it("rate limits per token with 429 rate_limited and a Retry-After header", async () => {
    const rateBatch = batchOf([], { agentHash: rateLimitedAgentHash });
    for (let i = 0; i < rateLimit; i++) {
      const response = await postEvents(rateLimitedToken, rateBatch);
      expect(response.statusCode).toBe(200);
    }
    const overLimit = await postEvents(rateLimitedToken, rateBatch);
    expect(overLimit.statusCode).toBe(429);
    expect(overLimit.json().error.code).toBe("rate_limited");
    const retryAfterSec = Number(overLimit.headers["retry-after"]);
    expect(retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("accepts valid events around a broken one and rejects it per item", async () => {
    const response = await postEvents(
      activeToken,
      batchOf([
        goldenEvent({ sourceRowId: "r1" }),
        { sourceRowId: "broken" },
        goldenEvent({ sourceRowId: "r3" }),
      ]),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      accepted: 2,
      duplicates: 0,
      rejected: [{ index: 1, code: "validation_failed" }],
    });
  });

  it("counts a retried identical batch entirely as duplicates", async () => {
    const retriedBatch = batchOf([
      goldenEvent({ sourceRowId: "r10" }),
      goldenEvent({ sourceRowId: "r11" }),
      goldenEvent({ sourceRowId: "r12" }),
    ]);
    const first = await postEvents(activeToken, retriedBatch);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ accepted: 3, duplicates: 0, rejected: [] });
    const retry = await postEvents(activeToken, retriedBatch);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual({ accepted: 0, duplicates: 3, rejected: [] });
  });

  it("promotes pending to confirmed with txHash and enqueues verification", async () => {
    const pendingPost = await postEvents(activeToken, batchOf([pendingEvent("r20")]));
    expect(pendingPost.statusCode).toBe(200);
    expect(pendingPost.json()).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
    const pendingRow = await activityRow("r20");
    expect(pendingRow.status).toBe("pending");
    expect(pendingRow.verification_state).toBe("none");
    const confirmedPost = await postEvents(activeToken, batchOf([goldenEvent({ sourceRowId: "r20" })]));
    expect(confirmedPost.statusCode).toBe(200);
    expect(confirmedPost.json()).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
    const promotedRow = await activityRow("r20");
    expect(promotedRow.status).toBe("confirmed");
    expect(promotedRow.statuses_seen).toEqual(["pending", "confirmed"]);
    expect(promotedRow.verification_state).toBe("queued");
    expect(promotedRow.tx_hash).toBe("0x123");
    const job = await verificationJobRow(promotedRow.id);
    expect(job.activity_id).toBe(promotedRow.id);
  });

  it("queues verification for a direct confirmed insert with txHash on backfill", async () => {
    const response = await postEvents(
      activeToken,
      batchOf([goldenEvent({ sourceRowId: "r21" })], { backfill: true }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
    const row = await activityRow("r21");
    expect(row.status).toBe("confirmed");
    expect(row.statuses_seen).toEqual(["confirmed"]);
    expect(row.verification_state).toBe("queued");
    expect(row.backfill).toBe(true);
    expect(row.received_schema_version).toBe(1);
    const job = await verificationJobRow(row.id);
    expect(job.activity_id).toBe(row.id);
  });

  it("accepts a confirmed launch event under a v2 envelope, inserts the row and queues verification", async () => {
    const response = await postEvents(
      activeToken,
      batchOf(
        [
          goldenEvent({
            sourceRowId: "r30",
            kind: "launch",
            eventRole: "token_launch",
            tokenIn: null,
            tokenOut: null,
            amountInRaw: null,
            amountOutRaw: null,
            executedInRaw: null,
            executedOutRaw: null,
            usdInEst: null,
            usdOutEst: null,
            usdFeeEst: null,
          }),
        ],
        { schemaVersion: 2 },
      ),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
    const row = await activityRow("r30");
    expect(row.kind).toBe("launch");
    expect(row.event_role).toBe("token_launch");
    expect(row.status).toBe("confirmed");
    expect(row.verification_state).toBe("queued");
    expect(row.received_schema_version).toBe(2);
    const job = await verificationJobRow(row.id);
    expect(job.activity_id).toBe(row.id);

    const retry = await postEvents(
      activeToken,
      batchOf(
        [
          goldenEvent({
            sourceRowId: "r30",
            kind: "launch",
            eventRole: "token_launch",
            tokenIn: null,
            tokenOut: null,
            amountInRaw: null,
            amountOutRaw: null,
            executedInRaw: null,
            executedOutRaw: null,
            usdInEst: null,
            usdOutEst: null,
            usdFeeEst: null,
          }),
        ],
        { schemaVersion: 2 },
      ),
    );
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
  });

  it("accepts an event carrying wallet_address, never stores the field and warns with the field name only", async () => {
    const response = await postEvents(
      activeToken,
      batchOf([goldenEvent({ sourceRowId: "r22", wallet_address: walletValue })]),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
    const row = await activityRow("r22");
    expect(row.status).toBe("confirmed");
    const rowJson = JSON.stringify(row);
    expect(rowJson).not.toContain("wallet_address");
    expect(rowJson).not.toContain(walletValue);
    const joinedLogs = logLines.join("");
    expect(joinedLogs).toContain("wallet_address");
    expect(joinedLogs).not.toContain(walletValue);
  });
});
