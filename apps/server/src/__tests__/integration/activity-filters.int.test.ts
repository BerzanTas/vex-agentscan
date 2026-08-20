import { EVENT_KINDS, type EventKind, type EventStatus } from "@agentscan/contract";
import { resolveChain } from "@agentscan/core";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import {
  agentAlias,
  type ActivityFeedDto,
  type AgentStatDto,
  type ProtocolRankingDto,
} from "../../public-dto.js";
import { startTestDb } from "../../testing/pg-harness.js";

const PAGE_SIZE = 3;

const config = loadConfig({
  DATABASE_URL: "postgres://unused-in-tests",
  PUBLIC_FEED_PAGE_SIZE: String(PAGE_SIZE),
  READ_CACHE_TTL_SEC: "0",
});

const agentAlpha = "a".repeat(64);
const agentBravo = "b".repeat(64);
const agentGhost = "c".repeat(64);

const aliasOf = (agentHash: string) => agentAlias(config.AGENT_ALIAS_SALT, agentHash);

async function seedAgent(pool: pg.Pool, agentHash: string, everVerified: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
     VALUES ($1, 'token-sha', 1, now(), CASE WHEN $2::bool THEN now() ELSE NULL END)`,
    [agentHash, everVerified],
  );
}

type ActivitySeed = {
  publicId: string;
  agentHash: string;
  kind: EventKind;
  eventRole: string;
  protocol: string;
  chainFamily: "eip155" | "solana";
  chainId: string;
  status: EventStatus;
  verificationState: string;
  usdInPriced: string | null;
  receivedSecondsAgo: number;
  confirmedDaysAgo: number | null;
};

async function seedActivity(pool: pg.Pool, seed: ActivitySeed): Promise<void> {
  await pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index, kind, event_role, status,
        protocol, chain_family, chain_id, usd_in_priced, pricing_state, tx_hash,
        client_created_at, client_confirmed_at, statuses_seen, verification_state, verified_at,
        received_at, received_schema_version)
     VALUES ($1, $2, $2, $2, 0, $3, $4, $5,
             $6, $7, $8::bigint, $9::numeric, 'server_priced', $10,
             now() - interval '3 hours',
             CASE WHEN $11::int IS NULL THEN NULL ELSE now() - make_interval(days => $11::int) END,
             ARRAY['pending'], $12,
             CASE WHEN $12 IN ('verified_full','verified_basic') THEN now() ELSE NULL END,
             now() - make_interval(secs => $13::int), 1)`,
    [
      seed.agentHash,
      seed.publicId,
      seed.kind,
      seed.eventRole,
      seed.status,
      seed.protocol,
      seed.chainFamily,
      seed.chainId,
      seed.usdInPriced,
      seed.status === "pending" ? null : `0x${seed.publicId}`,
      seed.confirmedDaysAgo,
      seed.verificationState,
      seed.receivedSecondsAgo,
    ],
  );
}

const seeds: ActivitySeed[] = [
  {
    publicId: "swap-base-full",
    agentHash: agentAlpha,
    kind: "swap",
    eventRole: "swap",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: "8453",
    status: "confirmed",
    verificationState: "verified_full",
    usdInPriced: "100",
    receivedSecondsAgo: 900,
    confirmedDaysAgo: 0,
  },
  {
    publicId: "swap-arb-basic",
    agentHash: agentAlpha,
    kind: "swap",
    eventRole: "swap",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: "42161",
    status: "confirmed",
    verificationState: "verified_basic",
    usdInPriced: "50",
    receivedSecondsAgo: 800,
    confirmedDaysAgo: 0,
  },
  {
    publicId: "swap-base-uniswap",
    agentHash: agentAlpha,
    kind: "swap",
    eventRole: "swap",
    protocol: "uniswap",
    chainFamily: "eip155",
    chainId: "8453",
    status: "confirmed",
    verificationState: "verified_full",
    usdInPriced: "70",
    receivedSecondsAgo: 700,
    confirmedDaysAgo: 40,
  },
  {
    publicId: "bridge-sol-khalani",
    agentHash: agentAlpha,
    kind: "bridge",
    eventRole: "bridge_deposit",
    protocol: "khalani",
    chainFamily: "solana",
    chainId: "20011000000",
    status: "confirmed",
    verificationState: "verified_full",
    usdInPriced: "25",
    receivedSecondsAgo: 600,
    confirmedDaysAgo: 0,
  },
  {
    publicId: "bridge-sol-relay",
    agentHash: agentBravo,
    kind: "bridge",
    eventRole: "bridge_deposit",
    protocol: "relay",
    chainFamily: "solana",
    chainId: "792703809",
    status: "confirmed",
    verificationState: "verified_full",
    usdInPriced: "10",
    receivedSecondsAgo: 500,
    confirmedDaysAgo: 2,
  },
  {
    publicId: "swap-base-queued",
    agentHash: agentAlpha,
    kind: "swap",
    eventRole: "swap",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: "8453",
    status: "confirmed",
    verificationState: "queued",
    usdInPriced: null,
    receivedSecondsAgo: 400,
    confirmedDaysAgo: 0,
  },
  {
    publicId: "swap-base-pending",
    agentHash: agentAlpha,
    kind: "swap",
    eventRole: "swap",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: "8453",
    status: "pending",
    verificationState: "none",
    usdInPriced: null,
    receivedSecondsAgo: 300,
    confirmedDaysAgo: null,
  },
  {
    publicId: "bridge-base-failed",
    agentHash: agentAlpha,
    kind: "bridge",
    eventRole: "bridge_deposit",
    protocol: "relay",
    chainFamily: "eip155",
    chainId: "8453",
    status: "definitively_failed",
    verificationState: "none",
    usdInPriced: null,
    receivedSecondsAgo: 200,
    confirmedDaysAgo: null,
  },
  {
    publicId: "swap-base-ghost-pending",
    agentHash: agentGhost,
    kind: "swap",
    eventRole: "swap",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: "8453",
    status: "pending",
    verificationState: "none",
    usdInPriced: null,
    receivedSecondsAgo: 100,
    confirmedDaysAgo: null,
  },
  {
    publicId: "bridge-sol-ghost-pending",
    agentHash: agentGhost,
    kind: "bridge",
    eventRole: "bridge_deposit",
    protocol: "khalani",
    chainFamily: "solana",
    chainId: "20011000000",
    status: "pending",
    verificationState: "none",
    usdInPriced: null,
    receivedSecondsAgo: 50,
    confirmedDaysAgo: null,
  },
  {
    publicId: "swap-base-mismatch",
    agentHash: agentAlpha,
    kind: "swap",
    eventRole: "swap",
    protocol: "kyberswap",
    chainFamily: "eip155",
    chainId: "8453",
    status: "confirmed",
    verificationState: "mismatch",
    usdInPriced: "999",
    receivedSecondsAgo: 25,
    confirmedDaysAgo: 0,
  },
];

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

type FeedPage = { ids: string[]; nextCursor: string | null };

async function feedPage(query: string): Promise<FeedPage> {
  const response = await app.inject({ method: "GET", url: `/api/activity${query}` });
  expect(response.statusCode).toBe(200);
  const page = response.json<ActivityFeedDto>();
  return { ids: page.items.map((item) => item.publicId), nextCursor: page.nextCursor };
}

async function feedIds(query: string): Promise<string[]> {
  return (await feedPage(query)).ids;
}

async function protocols(query: string): Promise<ProtocolRankingDto[]> {
  const response = await app.inject({ method: "GET", url: `/api/protocols/ranking${query}` });
  expect(response.statusCode).toBe(200);
  return response.json<ProtocolRankingDto[]>();
}

async function agents(query: string): Promise<AgentStatDto[]> {
  const response = await app.inject({ method: "GET", url: `/api/agents${query}` });
  expect(response.statusCode).toBe(200);
  return response.json<AgentStatDto[]>();
}

beforeAll(async () => {
  db = await startTestDb();
  await seedAgent(db.pool, agentAlpha, true);
  await seedAgent(db.pool, agentBravo, true);
  await seedAgent(db.pool, agentGhost, false);
  for (const seed of seeds) await seedActivity(db.pool, seed);
  app = await buildApp({ pool: db.pool, config, resolveChain });
});

afterAll(async () => {
  await app.close();
  await db.stop();
});

describe("GET /api/activity with filters and the visibility rule", () => {
  it("never reveals a pending row of an agent without any verified activity", async () => {
    expect(await feedIds("?status=pending")).toEqual(["swap-base-pending"]);
  });

  it("never reveals a row of an agent without any verified activity under the verification filter", async () => {
    expect(await feedIds("?verification=pending")).toEqual([
      "swap-base-queued",
      "bridge-base-failed",
      "swap-base-pending",
    ]);
  });

  it("keeps the unverified agent invisible under a chain filter that matches its rows", async () => {
    expect(await feedIds("?chain=solana&status=pending")).toEqual([]);
  });
});

describe("GET /api/activity filter combinations", () => {
  it("combines kind and chain with AND", async () => {
    expect(await feedIds("?kind=bridge&chain=base")).toEqual(["bridge-base-failed"]);
  });

  it("combines protocol and verification with AND", async () => {
    expect(await feedIds("?protocol=kyberswap&verification=pending")).toEqual([
      "swap-base-queued",
      "swap-base-pending",
    ]);
  });

  it("filters by status independently of the verification state", async () => {
    expect(await feedIds("?status=definitively_failed")).toEqual(["bridge-base-failed"]);
  });

  it("matches both provider ids of a chain that has more than one", async () => {
    expect(await feedIds("?chain=solana")).toEqual(["bridge-sol-khalani", "bridge-sol-relay"]);
  });

  it("matches only the single registry pair of an evm chain", async () => {
    expect(await feedIds("?chain=arbitrum")).toEqual(["swap-arb-basic"]);
  });
});

describe("GET /api/activity with values that are not offered", () => {
  it("ignores an unknown kind", async () => {
    expect(await feedPage("?kind=teleport")).toEqual(await feedPage(""));
  });

  it("ignores an unknown status", async () => {
    expect(await feedPage("?status=maybe")).toEqual(await feedPage(""));
  });

  it("ignores verification=mismatch instead of exposing mismatch rows", async () => {
    const filtered = await feedPage("?verification=mismatch");
    expect(filtered).toEqual(await feedPage(""));
    expect(filtered.ids).not.toContain("swap-base-mismatch");
  });

  it("ignores a chain slug the registry does not know", async () => {
    expect(await feedPage("?chain=narnia")).toEqual(await feedPage(""));
  });

  it("narrows to nothing for a registry chain without visible rows", async () => {
    expect(await feedPage("?chain=polygon")).toEqual({ ids: [], nextCursor: null });
  });
});

describe("GET /api/activity paging with a filter", () => {
  it("returns disjoint pages that lose no row at the boundary", async () => {
    const firstPage = await feedPage("?kind=swap");
    expect(firstPage.ids).toEqual(["swap-base-queued", "swap-arb-basic", "swap-base-full"]);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await feedPage(`?kind=swap&cursor=${firstPage.nextCursor}`);
    expect(secondPage.ids).toEqual(["swap-base-pending", "swap-base-uniswap"]);
    expect(secondPage.nextCursor).toBeNull();
  });
});

describe("GET /api/protocols with a range", () => {
  it("counts only the rows confirmed inside the 24h window", async () => {
    expect(await protocols("?range=24h")).toEqual([
      { protocol: "kyberswap", volumeUsd: "150", txCount: 2, chainCount: 2, swapTxCount: 2, bridgeTxCount: 0 },
      { protocol: "khalani", volumeUsd: "25", txCount: 1, chainCount: 1, swapTxCount: 0, bridgeTxCount: 1 },
    ]);
  });

  it("counts every verified row for the all range", async () => {
    expect(await protocols("?range=all")).toEqual([
      { protocol: "kyberswap", volumeUsd: "150", txCount: 2, chainCount: 2, swapTxCount: 2, bridgeTxCount: 0 },
      { protocol: "uniswap", volumeUsd: "70", txCount: 1, chainCount: 1, swapTxCount: 1, bridgeTxCount: 0 },
      { protocol: "khalani", volumeUsd: "25", txCount: 1, chainCount: 1, swapTxCount: 0, bridgeTxCount: 1 },
      { protocol: "relay", volumeUsd: "10", txCount: 1, chainCount: 1, swapTxCount: 0, bridgeTxCount: 1 },
    ]);
  });

  it("defaults to the 30d window when the range is absent or unknown", async () => {
    const thirtyDays = await protocols("?range=30d");
    expect(thirtyDays.map((row) => row.protocol)).toEqual(["kyberswap", "khalani", "relay"]);
    expect(await protocols("")).toEqual(thirtyDays);
    expect(await protocols("?range=42h")).toEqual(thirtyDays);
  });
});

describe("GET /api/agents with a range", () => {
  it("counts distinct protocols and chains rather than rows", async () => {
    expect(await agents("?range=all")).toEqual([
      {
        alias: aliasOf(agentAlpha),
        name: null,
        volumeUsd: "245",
        txCount: 4,
        protocolCount: 3,
        chainCount: 3,
        lastSeenSeconds: expect.any(Number),
      },
      {
        alias: aliasOf(agentBravo),
        name: null,
        volumeUsd: "10",
        txCount: 1,
        protocolCount: 1,
        chainCount: 1,
        lastSeenSeconds: expect.any(Number),
      },
    ]);
  });

  it("ages the last activity of each alias in seconds", async () => {
    const [alpha, bravo] = await agents("?range=all");
    expect(Math.floor((alpha?.lastSeenSeconds ?? -1) / 3600)).toBe(0);
    expect(Math.floor((bravo?.lastSeenSeconds ?? -1) / 3600)).toBe(48);
  });

  it("drops an alias whose only activity is older than the window", async () => {
    expect(await agents("?range=24h")).toEqual([
      {
        alias: aliasOf(agentAlpha),
        name: null,
        volumeUsd: "175",
        txCount: 3,
        protocolCount: 2,
        chainCount: 3,
        lastSeenSeconds: expect.any(Number),
      },
    ]);
  });

  it("never ranks an agent without a verified activity", async () => {
    const aliases = (await agents("?range=all")).map((row) => row.alias);
    expect(aliases).not.toContain(aliasOf(agentGhost));
  });
});

describe("GET /api/activity serving a launch kind row", () => {
  afterAll(async () => {
    await db.pool.query("DELETE FROM activities WHERE public_id = 'launch-base-verified'");
  });

  it("serves a verified launch row without breaking, with its kind and eventRole intact", async () => {
    await seedActivity(db.pool, {
      publicId: "launch-base-verified",
      agentHash: agentAlpha,
      kind: "launch",
      eventRole: "token_launch",
      protocol: "p-launch-feed",
      chainFamily: "eip155",
      chainId: "8453",
      status: "confirmed",
      verificationState: "verified_basic",
      usdInPriced: null,
      receivedSecondsAgo: 5,
      confirmedDaysAgo: 0,
    });

    const response = await app.inject({ method: "GET", url: "/api/activity?protocol=p-launch-feed" });
    expect(response.statusCode).toBe(200);
    const page = response.json<ActivityFeedDto>();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      publicId: "launch-base-verified",
      kind: "launch",
      eventRole: "token_launch",
    });
  });
});

const KIND_SWEEP_PROTOCOL = "p-kind-sweep";

const kindSweepRole: Record<EventKind, string> = {
  swap: "swap",
  bridge: "bridge_deposit",
  lend: "lend_deposit",
  prediction: "predict_buy",
  wrap: "wrap",
  yield: "yield_lp",
  launch: "token_launch",
  claim: "pools_claim",
};

const kindSweepId = (kind: EventKind) => `kind-sweep-${kind}`;

describe("GET /api/activity filtering by every kind the contract reports", () => {
  beforeAll(async () => {
    for (const kind of EVENT_KINDS) {
      await seedActivity(db.pool, {
        publicId: kindSweepId(kind),
        agentHash: agentAlpha,
        kind,
        eventRole: kindSweepRole[kind],
        protocol: KIND_SWEEP_PROTOCOL,
        chainFamily: "eip155",
        chainId: "8453",
        status: "confirmed",
        verificationState: "verified_full",
        usdInPriced: null,
        receivedSecondsAgo: 5,
        confirmedDaysAgo: 0,
      });
    }
  });

  afterAll(async () => {
    await db.pool.query("DELETE FROM activities WHERE protocol = $1", [KIND_SWEEP_PROTOCOL]);
  });

  it.each(EVENT_KINDS)("narrows the feed to the %s row of a protocol holding one row per kind", async (kind) => {
    expect(await feedIds(`?protocol=${KIND_SWEEP_PROTOCOL}&kind=${kind}`)).toEqual([kindSweepId(kind)]);
  });
});

describe("GET /api/activity filtering by the superseded status", () => {
  afterAll(async () => {
    await db.pool.query("DELETE FROM activities WHERE public_id = 'swap-base-superseded'");
  });

  beforeAll(async () => {
    await seedActivity(db.pool, {
      publicId: "swap-base-superseded",
      agentHash: agentAlpha,
      kind: "swap",
      eventRole: "swap",
      protocol: "p-superseded",
      chainFamily: "eip155",
      chainId: "8453",
      status: "superseded_unproven",
      verificationState: "none",
      usdInPriced: null,
      receivedSecondsAgo: 5,
      confirmedDaysAgo: null,
    });
  });

  it("offers superseded_unproven as a status filter and returns only its rows", async () => {
    expect(await feedIds("?status=superseded_unproven")).toEqual(["swap-base-superseded"]);
  });

  it("never returns a superseded row under the failed status", async () => {
    expect(await feedIds("?status=definitively_failed")).toEqual(["bridge-base-failed"]);
  });
});

describe("GET /api/activity with a filter while the read cache is warm", () => {
  let cachedApp: FastifyInstance;

  beforeAll(async () => {
    const cachedConfig = loadConfig({
      DATABASE_URL: "postgres://unused-in-tests",
      PUBLIC_FEED_PAGE_SIZE: String(PAGE_SIZE),
      READ_CACHE_TTL_SEC: "300",
    });
    cachedApp = await buildApp({ pool: db.pool, config: cachedConfig, resolveChain });
  });

  afterAll(async () => {
    await cachedApp.close();
    await db.pool.query("DELETE FROM activities WHERE public_id = 'swap-base-fresh'");
  });

  it("serves a row inserted after the first filtered request", async () => {
    const first = await cachedApp.inject({ method: "GET", url: "/api/activity?kind=swap" });
    expect(first.json<ActivityFeedDto>().items.map((item) => item.publicId)).not.toContain(
      "swap-base-fresh",
    );

    await seedActivity(db.pool, {
      publicId: "swap-base-fresh",
      agentHash: agentAlpha,
      kind: "swap",
      eventRole: "swap",
      protocol: "kyberswap",
      chainFamily: "eip155",
      chainId: "8453",
      status: "confirmed",
      verificationState: "verified_full",
      usdInPriced: "1",
      receivedSecondsAgo: 10,
      confirmedDaysAgo: 0,
    });

    const second = await cachedApp.inject({ method: "GET", url: "/api/activity?kind=swap" });
    expect(second.json<ActivityFeedDto>().items.map((item) => item.publicId)).toContain(
      "swap-base-fresh",
    );
  });
});
