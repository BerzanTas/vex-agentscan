import { createHash } from "node:crypto";
import { Writable } from "node:stream";
import { handshakeChallengeTemplate } from "@agentscan/contract";
import bs58 from "bs58";
import type { FastifyInstance } from "fastify";
import { pino, type Logger } from "pino";
import type pg from "pg";
import nacl from "tweetnacl";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";

const pepper = "handshake-int-test-pepper-value1";
const sha256hex = (value: string) => createHash("sha256").update(value).digest("hex");
const requestIp = "203.0.113.42";

function randomAgentHash(): string {
  return generatePrivateKey().slice(2, 66);
}

function evmKeypair() {
  return privateKeyToAccount(generatePrivateKey());
}

function solanaKeypair() {
  return nacl.sign.keyPair();
}

async function signEvmProof(args: {
  account: ReturnType<typeof evmKeypair>;
  agentHash: string;
  domain: string;
  nonce: string;
  issuedAt: string;
}) {
  const address = args.account.address.toLowerCase();
  const template = handshakeChallengeTemplate({
    domain: args.domain,
    agentHash: args.agentHash,
    address,
    chainFamily: "eip155",
    nonce: args.nonce,
    issuedAt: args.issuedAt,
  });
  const signature = await args.account.signMessage({ message: template });
  return { chainFamily: "eip155" as const, address, signature, issuedAt: args.issuedAt };
}

function signSolanaProof(args: {
  keyPair: ReturnType<typeof solanaKeypair>;
  agentHash: string;
  domain: string;
  nonce: string;
  issuedAt: string;
}) {
  const address = bs58.encode(args.keyPair.publicKey);
  const template = handshakeChallengeTemplate({
    domain: args.domain,
    agentHash: args.agentHash,
    address,
    chainFamily: "solana",
    nonce: args.nonce,
    issuedAt: args.issuedAt,
  });
  const prefix = Buffer.from([0xff]);
  const tag = Buffer.from("solana offchain", "ascii");
  const message = Buffer.concat([prefix, tag, Buffer.from(template, "utf8")]);
  const signature = bs58.encode(nacl.sign.detached(message, args.keyPair.secretKey));
  return { chainFamily: "solana" as const, address, signature, issuedAt: args.issuedAt };
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let pool: pg.Pool;
let app: FastifyInstance;

function buildTestApp(overrides: Record<string, string> = {}, loggerInstance?: Logger): Promise<FastifyInstance> {
  const config = loadConfig({
    DATABASE_URL: "postgres://unused-in-tests",
    WALLET_HMAC_PEPPER: pepper,
    HANDSHAKE_RATE_LIMIT_PER_IP: "1000",
    HANDSHAKE_RATE_WINDOW_SEC: "3600",
    ...overrides,
  });
  return buildApp({ pool, config, resolveChain: () => null, loggerInstance });
}

beforeAll(async () => {
  db = await startTestDb();
  pool = db.pool;
  app = await buildTestApp();
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

beforeEach(async () => {
  await pool.query("TRUNCATE agents, handshake_challenges, agent_wallets CASCADE");
});

const startSession = (payload: unknown, remoteAddress = requestIp) =>
  app.inject({ method: "POST", url: "/v2/agents/session/start", payload: payload as object, remoteAddress });

const completeSession = (payload: unknown, bearer?: string) =>
  app.inject({
    method: "POST",
    url: "/v2/agents/session/complete",
    payload: payload as object,
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });

async function startedChallenge(agentHash: string, addresses: unknown[]) {
  const response = await startSession({ agentHash, addresses });
  expect(response.statusCode).toBe(200);
  return response.json<{ challengeId: string; nonce: string; domain: string; expiresAt: string }>();
}

async function allTableRowsAsJson(): Promise<string> {
  const tables = ["agents", "agent_wallets", "handshake_challenges"];
  const rows: unknown[] = [];
  for (const table of tables) {
    const result = await pool.query(`SELECT * FROM ${table}`);
    rows.push(...result.rows);
  }
  return JSON.stringify(rows);
}

describe("POST /v2/agents/session/start", () => {
  it("returns a fresh challenge shaped per the wire contract", async () => {
    const agentHash = randomAgentHash();
    const account = evmKeypair();

    const response = await startSession({
      agentHash,
      addresses: [{ chainFamily: "eip155", address: account.address }],
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ challengeId: string; nonce: string; domain: string; expiresAt: string }>();
    expect(body.challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.domain).toBe("localhost");
    const expiresInMs = new Date(body.expiresAt).getTime() - Date.now();
    expect(expiresInMs).toBeGreaterThan(4 * 60_000);
    expect(expiresInMs).toBeLessThanOrEqual(5 * 60_000 + 5_000);
  });

  it("never stores the plaintext address, only its hmac", async () => {
    const agentHash = randomAgentHash();
    const account = evmKeypair();

    await startSession({ agentHash, addresses: [{ chainFamily: "eip155", address: account.address }] });

    const rows = await pool.query("SELECT address_hmacs FROM handshake_challenges");
    expect(rows.rows[0].address_hmacs).toHaveLength(1);
    expect(rows.rows[0].address_hmacs[0]).not.toBe(account.address.toLowerCase());
    expect(JSON.stringify(rows.rows)).not.toContain(account.address.toLowerCase());
  });

  it("rejects a malformed body with validation_failed", async () => {
    const response = await startSession({ agentHash: "not-a-hash", addresses: [] });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation_failed");
  });

  it("rate limits after the configured per-IP threshold", async () => {
    const limitedApp = await buildTestApp({ HANDSHAKE_RATE_LIMIT_PER_IP: "2", HANDSHAKE_RATE_WINDOW_SEC: "3600" });
    try {
      const account = evmKeypair();
      const body = { agentHash: randomAgentHash(), addresses: [{ chainFamily: "eip155", address: account.address }] };
      const limitedIp = "203.0.113.77";
      const first = await limitedApp.inject({ method: "POST", url: "/v2/agents/session/start", payload: body, remoteAddress: limitedIp });
      const second = await limitedApp.inject({ method: "POST", url: "/v2/agents/session/start", payload: body, remoteAddress: limitedIp });
      const third = await limitedApp.inject({ method: "POST", url: "/v2/agents/session/start", payload: body, remoteAddress: limitedIp });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(third.statusCode).toBe(429);
      expect(third.json().error.code).toBe("rate_limited");
      expect(Number(third.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    } finally {
      await limitedApp.close();
    }
  });
});

describe("POST /v2/agents/session/complete — happy path", () => {
  it("binds an EVM and a Solana wallet, creates the agent, and rotates in a fresh token", async () => {
    const agentHash = randomAgentHash();
    const evmAccount = evmKeypair();
    const solanaKeys = solanaKeypair();
    const challenge = await startedChallenge(agentHash, [
      { chainFamily: "eip155", address: evmAccount.address },
      { chainFamily: "solana", address: bs58.encode(solanaKeys.publicKey) },
    ]);
    const issuedAt = new Date().toISOString();

    const response = await completeSession({
      challengeId: challenge.challengeId,
      agentHash,
      consentVersion: 1,
      proofs: [
        await signEvmProof({ account: evmAccount, agentHash, domain: challenge.domain, nonce: challenge.nonce, issuedAt }),
        signSolanaProof({ keyPair: solanaKeys, agentHash, domain: challenge.domain, nonce: challenge.nonce, issuedAt }),
      ],
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; ingestToken: string; agentName: string; syncState: { lastAcceptedRowId: string | null } }>();
    expect(body.status).toBe("bound");
    expect(body.ingestToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.agentName).toBe(`Vex-${agentHash.slice(0, 8)}`);
    expect(body.syncState).toEqual({ lastAcceptedRowId: null });

    const agentRow = await pool.query("SELECT * FROM agents WHERE agent_hash = $1", [agentHash]);
    expect(agentRow.rows[0].ingest_token_sha256).toBe(sha256hex(body.ingestToken));
    expect(agentRow.rows[0].status).toBe("active");
    expect(agentRow.rows[0].last_handshake_at).not.toBeNull();

    const walletRows = await pool.query("SELECT chain_family FROM agent_wallets WHERE agent_hash = $1 ORDER BY chain_family", [agentHash]);
    expect(walletRows.rows.map((row: { chain_family: string }) => row.chain_family)).toEqual(["eip155", "solana"]);

    const dump = await allTableRowsAsJson();
    expect(dump).not.toContain(evmAccount.address.toLowerCase());
    expect(dump).not.toContain(bs58.encode(solanaKeys.publicKey));
    expect(dump).not.toContain(pepper);

    const eventsWithNewToken = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${body.ingestToken}` },
      payload: { schemaVersion: 1, agentHash, backfill: false, events: [] },
    });
    expect(eventsWithNewToken.statusCode).toBe(200);
  });
});

describe("POST /v2/agents/session/complete — upgrading an existing v1 agent (AC4)", () => {
  it("requires the existing agent's bearer token, keeps its history, and rotates its token", async () => {
    const agentHash = randomAgentHash();
    const oldToken = "A".repeat(43);
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, $2, 1, now())",
      [agentHash, sha256hex(oldToken)],
    );
    await pool.query(
      `INSERT INTO activities
         (agent_hash, source_row_id, public_id, source_execution_id, event_index,
          kind, event_role, status, protocol, chain_family, chain_id,
          client_created_at, statuses_seen, received_schema_version)
       VALUES ($1, '17', '17', '9021', 0, 'swap', 'swap', 'confirmed', 'kyberswap', 'eip155', 8453,
               now(), ARRAY['confirmed'], 1)`,
      [agentHash],
    );
    const evmAccount = evmKeypair();

    async function proofsForFreshChallenge() {
      const challenge = await startedChallenge(agentHash, [{ chainFamily: "eip155", address: evmAccount.address }]);
      const issuedAt = new Date().toISOString();
      const proofs = [await signEvmProof({ account: evmAccount, agentHash, domain: challenge.domain, nonce: challenge.nonce, issuedAt })];
      return { challengeId: challenge.challengeId, proofs };
    }

    const withoutBearerAttempt = await proofsForFreshChallenge();
    const withoutBearer = await completeSession({ challengeId: withoutBearerAttempt.challengeId, agentHash, consentVersion: 2, proofs: withoutBearerAttempt.proofs });
    expect(withoutBearer.statusCode).toBe(401);
    expect(withoutBearer.json().error.code).toBe("unauthorized");

    const wrongBearerAttempt = await proofsForFreshChallenge();
    const wrongBearer = await completeSession({ challengeId: wrongBearerAttempt.challengeId, agentHash, consentVersion: 2, proofs: wrongBearerAttempt.proofs }, "B".repeat(43));
    expect(wrongBearer.statusCode).toBe(401);

    const correctBearerAttempt = await proofsForFreshChallenge();
    const correctBearer = await completeSession({ challengeId: correctBearerAttempt.challengeId, agentHash, consentVersion: 2, proofs: correctBearerAttempt.proofs }, oldToken);
    expect(correctBearer.statusCode).toBe(200);
    const body = correctBearer.json<{ ingestToken: string; syncState: { lastAcceptedRowId: string | null } }>();
    expect(body.syncState).toEqual({ lastAcceptedRowId: "17" });

    const agentRow = await pool.query("SELECT agent_hash, consent_version FROM agents WHERE agent_hash = $1", [agentHash]);
    expect(agentRow.rows).toHaveLength(1);
    expect(agentRow.rows[0].consent_version).toBe(2);

    const oldTokenEvents = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${oldToken}` },
      payload: { schemaVersion: 1, agentHash, backfill: false, events: [] },
    });
    expect(oldTokenEvents.statusCode).toBe(401);

    const newTokenEvents = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${body.ingestToken}` },
      payload: { schemaVersion: 1, agentHash, backfill: false, events: [] },
    });
    expect(newTokenEvents.statusCode).toBe(200);
  });
});

describe("POST /v2/agents/session/complete — security (AC3)", () => {
  it("burns the nonce on the first attempt and returns challenge_expired on replay", async () => {
    const agentHash = randomAgentHash();
    const evmAccount = evmKeypair();
    const challenge = await startedChallenge(agentHash, [{ chainFamily: "eip155", address: evmAccount.address }]);
    const issuedAt = new Date().toISOString();
    const proofs = [await signEvmProof({ account: evmAccount, agentHash, domain: challenge.domain, nonce: challenge.nonce, issuedAt })];
    const body = { challengeId: challenge.challengeId, agentHash, consentVersion: 1, proofs };

    const first = await completeSession(body);
    expect(first.statusCode).toBe(200);

    const replay = await completeSession(body);
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.code).toBe("challenge_expired");
  });

  it("returns challenge_expired for an expired challenge", async () => {
    const agentHash = randomAgentHash();
    const evmAccount = evmKeypair();
    const challenge = await startedChallenge(agentHash, [{ chainFamily: "eip155", address: evmAccount.address }]);
    await pool.query("UPDATE handshake_challenges SET expires_at = now() - interval '1 second' WHERE id = $1", [challenge.challengeId]);
    const issuedAt = new Date().toISOString();
    const proofs = [await signEvmProof({ account: evmAccount, agentHash, domain: challenge.domain, nonce: challenge.nonce, issuedAt })];

    const response = await completeSession({ challengeId: challenge.challengeId, agentHash, consentVersion: 1, proofs });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("challenge_expired");
  });

  it("returns invalid_signature for a tampered proof, burns the nonce, and binds nothing", async () => {
    const agentHash = randomAgentHash();
    const evmAccount = evmKeypair();
    const challenge = await startedChallenge(agentHash, [{ chainFamily: "eip155", address: evmAccount.address }]);
    const issuedAt = new Date().toISOString();
    const validProof = await signEvmProof({ account: evmAccount, agentHash, domain: "evil.example", nonce: challenge.nonce, issuedAt });

    const response = await completeSession({ challengeId: challenge.challengeId, agentHash, consentVersion: 1, proofs: [validProof] });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_signature");
    const challengeRow = await pool.query("SELECT used_at FROM handshake_challenges WHERE id = $1", [challenge.challengeId]);
    expect(challengeRow.rows[0].used_at).not.toBeNull();
    const agentRow = await pool.query("SELECT * FROM agents WHERE agent_hash = $1", [agentHash]);
    expect(agentRow.rows).toHaveLength(0);
  });

  it("returns wallet_conflict and binds nothing when an address is already owned by another agent", async () => {
    const ownerAgentHash = randomAgentHash();
    const attackerAgentHash = randomAgentHash();
    const sharedAccount = evmKeypair();

    const ownerChallenge = await startedChallenge(ownerAgentHash, [{ chainFamily: "eip155", address: sharedAccount.address }]);
    const ownerIssuedAt = new Date().toISOString();
    const ownerComplete = await completeSession({
      challengeId: ownerChallenge.challengeId,
      agentHash: ownerAgentHash,
      consentVersion: 1,
      proofs: [await signEvmProof({ account: sharedAccount, agentHash: ownerAgentHash, domain: ownerChallenge.domain, nonce: ownerChallenge.nonce, issuedAt: ownerIssuedAt })],
    });
    expect(ownerComplete.statusCode).toBe(200);

    const attackerChallenge = await startedChallenge(attackerAgentHash, [{ chainFamily: "eip155", address: sharedAccount.address }]);
    const attackerIssuedAt = new Date().toISOString();
    const attackerComplete = await completeSession({
      challengeId: attackerChallenge.challengeId,
      agentHash: attackerAgentHash,
      consentVersion: 1,
      proofs: [await signEvmProof({ account: sharedAccount, agentHash: attackerAgentHash, domain: attackerChallenge.domain, nonce: attackerChallenge.nonce, issuedAt: attackerIssuedAt })],
    });

    expect(attackerComplete.statusCode).toBe(409);
    expect(attackerComplete.json().error.code).toBe("wallet_conflict");
    const attackerAgentRow = await pool.query("SELECT * FROM agents WHERE agent_hash = $1", [attackerAgentHash]);
    expect(attackerAgentRow.rows).toHaveLength(0);
    const walletRow = await pool.query("SELECT agent_hash FROM agent_wallets WHERE chain_family = 'eip155'");
    expect(walletRow.rows).toHaveLength(1);
  });
});

describe("privacy: no plaintext address or pepper is ever logged (AC5)", () => {
  it("keeps addresses and the pepper out of every captured log line across a full handshake", async () => {
    const chunks: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const capturingLogger = pino(destination);
    const loggedApp = await buildTestApp({}, capturingLogger);
    try {
      const agentHash = randomAgentHash();
      const account = evmKeypair();
      const startResponse = await loggedApp.inject({
        method: "POST",
        url: "/v2/agents/session/start",
        payload: { agentHash, addresses: [{ chainFamily: "eip155", address: account.address }] },
        remoteAddress: requestIp,
      });
      const challenge = startResponse.json<{ challengeId: string; nonce: string; domain: string }>();
      const issuedAt = new Date().toISOString();
      const proof = await signEvmProof({ account, agentHash, domain: challenge.domain, nonce: challenge.nonce, issuedAt });

      await loggedApp.inject({
        method: "POST",
        url: "/v2/agents/session/complete",
        payload: { challengeId: challenge.challengeId, agentHash, consentVersion: 1, proofs: [proof] },
      });

      const logText = chunks.join("");
      expect(logText).not.toContain(account.address.toLowerCase());
      expect(logText).not.toContain(account.address);
      expect(logText).not.toContain(pepper);
    } finally {
      await loggedApp.close();
    }
  });
});
