import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { startTestDb } from "../../testing/pg-harness.js";

const AGENT_HASH = "a".repeat(64);

let db: { pool: pg.Pool; stop(): Promise<void> };

beforeAll(async () => {
  db = await startTestDb();
});

afterAll(async () => {
  await db.stop();
});

function insertChallenge(args: { nonce: string; addressHmacs: string[] }) {
  return db.pool.query(
    `INSERT INTO handshake_challenges (agent_hash, nonce, domain, address_hmacs, expires_at)
     VALUES ($1, $2, 'localhost', $3, now() + interval '5 minutes')
     RETURNING id`,
    [AGENT_HASH, args.nonce, args.addressHmacs],
  );
}

describe("handshake_challenges schema", () => {
  it("accepts a challenge row with a generated uuid id", async () => {
    const inserted = await insertChallenge({ nonce: "nonce-1", addressHmacs: ["h1", "h2"] });
    expect(inserted.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a second challenge with the same nonce", async () => {
    await insertChallenge({ nonce: "nonce-dup", addressHmacs: ["h1"] });
    await expect(insertChallenge({ nonce: "nonce-dup", addressHmacs: ["h2"] })).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("defaults used_at to null", async () => {
    const inserted = await insertChallenge({ nonce: "nonce-null-used", addressHmacs: ["h1"] });
    const row = await db.pool.query("SELECT used_at FROM handshake_challenges WHERE id = $1", [
      inserted.rows[0].id,
    ]);
    expect(row.rows[0].used_at).toBeNull();
  });
});

describe("agent_wallets schema", () => {
  beforeAll(async () => {
    await db.pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, $2, 1, now()) ON CONFLICT DO NOTHING",
      [AGENT_HASH, "b".repeat(64)],
    );
  });

  function insertWallet(args: { chainFamily: string; addressHmac: string }) {
    return db.pool.query(
      `INSERT INTO agent_wallets (agent_hash, chain_family, address_hmac, proof_signature)
       VALUES ($1, $2, $3, 'sig')`,
      [AGENT_HASH, args.chainFamily, args.addressHmac],
    );
  }

  it("accepts a wallet row for a known agent", async () => {
    const inserted = await insertWallet({ chainFamily: "eip155", addressHmac: "hmac-1" });
    expect(inserted.rowCount).toBe(1);
  });

  it("rejects a chain_family outside the allowed set", async () => {
    await expect(insertWallet({ chainFamily: "bitcoin", addressHmac: "hmac-2" })).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("rejects a duplicate (chain_family, address_hmac) pair", async () => {
    await insertWallet({ chainFamily: "solana", addressHmac: "hmac-dup" });
    await expect(insertWallet({ chainFamily: "solana", addressHmac: "hmac-dup" })).rejects.toMatchObject({
      code: "23505",
    });
  });
});

describe("agents.name and agents.last_handshake_at", () => {
  it("rejects two agents with the same name", async () => {
    await db.pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, name) VALUES ($1, 'tok-1', 1, now(), 'Vex-dupname')",
      ["c".repeat(64)],
    );
    await expect(
      db.pool.query(
        "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, name) VALUES ($1, 'tok-2', 1, now(), 'Vex-dupname')",
        ["d".repeat(64)],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("leaves name and last_handshake_at null by default", async () => {
    await db.pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, 'tok-3', 1, now())",
      ["e".repeat(64)],
    );
    const row = await db.pool.query("SELECT name, last_handshake_at FROM agents WHERE agent_hash = $1", [
      "e".repeat(64),
    ]);
    expect(row.rows[0].name).toBeNull();
    expect(row.rows[0].last_handshake_at).toBeNull();
  });
});
