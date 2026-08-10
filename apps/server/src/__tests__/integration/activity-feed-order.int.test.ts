import { resolveChain } from "@agentscan/core";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import type { ActivityFeedDto, ActivityRowDto } from "../../public-dto.js";
import { startTestDb } from "../../testing/pg-harness.js";

const PAGE_SIZE = 3;

const config = loadConfig({
  DATABASE_URL: "postgres://unused-in-tests",
  PUBLIC_FEED_PAGE_SIZE: String(PAGE_SIZE),
  READ_CACHE_TTL_SEC: "0",
});

const agentHash = "e".repeat(64);

const TIED_PUBLIC_IDS = ["event-020-tie-lower-id", "event-020-tie-higher-id"];

type ActivitySeed = {
  publicId: string;
  createdMinutesAgo: number;
  confirmedMinutesAgo: number | null;
  blockMinutesAgo: number | null;
  receivedSecondsAgo: number;
  status: "pending" | "confirmed";
  verificationState: string;
};

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, tx_hash,
        client_created_at, client_confirmed_at, block_time,
        statuses_seen, verification_state, verified_at, received_at, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, 'swap', 'swap', $3,
             'kyberswap', 'eip155', 8453, '0xfeed',
             now() - make_interval(mins => $4::int),
             CASE WHEN $5::int IS NULL THEN NULL ELSE now() - make_interval(mins => $5::int) END,
             CASE WHEN $6::int IS NULL THEN NULL ELSE now() - make_interval(mins => $6::int) END,
             ARRAY['confirmed'], $7,
             CASE WHEN $7 IN ('verified_full','verified_basic') THEN now() ELSE NULL END,
             now() - make_interval(secs => $8::int), 1)`,
    [
      agentHash,
      seed.publicId,
      seed.status,
      seed.createdMinutesAgo,
      seed.confirmedMinutesAgo,
      seed.blockMinutesAgo,
      seed.verificationState,
      seed.receivedSecondsAgo,
    ],
  );
}

async function tieTheirConfirmationInstant(pool: pg.Pool): Promise<void> {
  await pool.query(
    `UPDATE activities SET client_confirmed_at = now() - interval '20 minutes'
     WHERE public_id = ANY($1::text[])`,
    [TIED_PUBLIC_IDS],
  );
}

const seedsInIngestOrder: ActivitySeed[] = [
  {
    publicId: "event-090-oldest",
    createdMinutesAgo: 95,
    confirmedMinutesAgo: 90,
    blockMinutesAgo: null,
    receivedSecondsAgo: 10,
    status: "confirmed",
    verificationState: "verified_full",
  },
  {
    publicId: "event-020-tie-lower-id",
    createdMinutesAgo: 25,
    confirmedMinutesAgo: 20,
    blockMinutesAgo: null,
    receivedSecondsAgo: 40,
    status: "confirmed",
    verificationState: "verified_full",
  },
  {
    publicId: "event-020-tie-higher-id",
    createdMinutesAgo: 25,
    confirmedMinutesAgo: 20,
    blockMinutesAgo: null,
    receivedSecondsAgo: 50,
    status: "confirmed",
    verificationState: "verified_full",
  },
  {
    publicId: "event-045-created-only",
    createdMinutesAgo: 45,
    confirmedMinutesAgo: null,
    blockMinutesAgo: null,
    receivedSecondsAgo: 20,
    status: "pending",
    verificationState: "none",
  },
  {
    publicId: "event-010-block-time-only",
    createdMinutesAgo: 200,
    confirmedMinutesAgo: null,
    blockMinutesAgo: 10,
    receivedSecondsAgo: 60,
    status: "confirmed",
    verificationState: "verified_full",
  },
  {
    publicId: "event-001-newest",
    createdMinutesAgo: 5,
    confirmedMinutesAgo: 1,
    blockMinutesAgo: null,
    receivedSecondsAgo: 30,
    status: "confirmed",
    verificationState: "verified_full",
  },
];

const NEWEST_FIRST_BY_EVENT_TIME = [
  "event-001-newest",
  "event-010-block-time-only",
  "event-020-tie-higher-id",
  "event-020-tie-lower-id",
  "event-045-created-only",
  "event-090-oldest",
];

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

async function feedPage(cursor: string | null): Promise<ActivityFeedDto> {
  const url = cursor === null ? "/api/activity" : `/api/activity?cursor=${cursor}`;
  const response = await app.inject({ method: "GET", url });
  expect(response.statusCode).toBe(200);
  return response.json<ActivityFeedDto>();
}

async function everyPage(): Promise<ActivityRowDto[]> {
  const rows: ActivityRowDto[] = [];
  let cursor: string | null = null;
  do {
    const page: ActivityFeedDto = await feedPage(cursor);
    rows.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return rows;
}

async function ageOf(publicId: string): Promise<number> {
  const row = (await everyPage()).find((candidate) => candidate.publicId === publicId);
  return row?.ageSeconds ?? -1;
}

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
     VALUES ($1, 'token-sha', 1, now(), now())`,
    [agentHash],
  );
  for (const seed of seedsInIngestOrder) await seedActivity(db.pool, seed);
  await tieTheirConfirmationInstant(db.pool);
  app = await buildApp({ pool: db.pool, config, resolveChain });
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("GET /api/activity ordering", () => {
  it("serves rows newest first by the event's own time, not by the ingest instant", async () => {
    const rows = await everyPage();

    expect(rows.map((row) => row.publicId)).toEqual(NEWEST_FIRST_BY_EVENT_TIME);
  });

  it("ages every row no younger than the row above it", async () => {
    const ages = (await everyPage()).map((row) => row.ageSeconds);

    expect(ages).toEqual([...ages].sort((left, right) => left - right));
  });

  it("ages a row settled on chain from its block time rather than its creation time", async () => {
    expect(Math.round((await ageOf("event-010-block-time-only")) / 60)).toBe(10);
  });

  it("ages a row that never settled from its creation time", async () => {
    expect(Math.round((await ageOf("event-045-created-only")) / 60)).toBe(45);
  });

  it("ages a confirmed row from its confirmation time", async () => {
    expect(Math.round((await ageOf("event-001-newest")) / 60)).toBe(1);
  });

  it("returns the same first page on every request", async () => {
    const first = await feedPage(null);
    const again = await feedPage(null);

    expect(again.items.map((row) => row.publicId)).toEqual(first.items.map((row) => row.publicId));
    expect(again.nextCursor).toEqual(first.nextCursor);
  });
});

describe("GET /api/activity paging across a boundary that splits two identical event times", () => {
  it("fills the first page with the newest rows and never leaves one for the second", async () => {
    const first = await feedPage(null);

    expect(first.items.map((row) => row.publicId)).toEqual(NEWEST_FIRST_BY_EVENT_TIME.slice(0, PAGE_SIZE));
  });

  it("continues the second page below the boundary without repeating or losing the tied row", async () => {
    const first = await feedPage(null);
    const second = await feedPage(first.nextCursor);

    expect(second.items.map((row) => row.publicId)).toEqual(NEWEST_FIRST_BY_EVENT_TIME.slice(PAGE_SIZE));
    expect(second.nextCursor).toBeNull();
  });

  it("breaks the tie by the later ingested row first, on both sides of the boundary", async () => {
    const first = await feedPage(null);
    const second = await feedPage(first.nextCursor);

    expect(first.items.at(-1)?.publicId).toBe("event-020-tie-higher-id");
    expect(second.items.at(0)?.publicId).toBe("event-020-tie-lower-id");
  });

  it("ages the two tied rows identically", async () => {
    expect(await ageOf("event-020-tie-higher-id")).toBe(await ageOf("event-020-tie-lower-id"));
  });

  it("never serves a row on the second page that is younger than the last of the first", async () => {
    const first = await feedPage(null);
    const second = await feedPage(first.nextCursor);

    expect(second.items.at(0)?.ageSeconds).toBeGreaterThanOrEqual(first.items.at(-1)?.ageSeconds ?? 0);
  });
});
