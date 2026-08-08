import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  claimChallenge,
  claimWallet,
  completeHandshakeBinding,
  deleteExpiredHandshakeChallenges,
  insertChallenge,
  lastAcceptedRowIdFor,
} from "../../repos/handshake-repo.js";
import { startTestDb } from "../../testing/pg-harness.js";

const AGENT_HASH = "a".repeat(64);
const OTHER_AGENT_HASH = "b".repeat(64);

let db: Awaited<ReturnType<typeof startTestDb>>;
let pool: pg.Pool;

beforeAll(async () => {
  db = await startTestDb();
  pool = db.pool;
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await pool.query("TRUNCATE agents, handshake_challenges, agent_wallets CASCADE");
});

async function freshChallenge(overrides: Partial<{ agentHash: string; expiresAt: Date; addressHmacs: string[] }> = {}) {
  return insertChallenge(pool, {
    agentHash: overrides.agentHash ?? AGENT_HASH,
    nonce: `nonce-${Math.random()}`,
    domain: "localhost",
    addressHmacs: overrides.addressHmacs ?? ["hmac-1"],
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 5 * 60_000),
  });
}

describe("insertChallenge + claimChallenge", () => {
  it("claims a fresh challenge and returns its stored fields", async () => {
    const { id } = await freshChallenge({ addressHmacs: ["hmac-a", "hmac-b"] });

    const outcome = await claimChallenge(pool, id, AGENT_HASH);

    expect(outcome.kind).toBe("claimed");
    if (outcome.kind !== "claimed") throw new Error("expected claimed");
    expect(outcome.challenge.domain).toBe("localhost");
    expect(outcome.challenge.addressHmacs).toEqual(["hmac-a", "hmac-b"]);
  });

  it("burns the nonce so a second claim of the same challenge is invalid", async () => {
    const { id } = await freshChallenge();

    await claimChallenge(pool, id, AGENT_HASH);
    const second = await claimChallenge(pool, id, AGENT_HASH);

    expect(second.kind).toBe("invalid");
  });

  it("deletes the challenge row on the very first matching-agent claim, even before any proof is checked", async () => {
    const { id } = await freshChallenge();

    await claimChallenge(pool, id, AGENT_HASH);

    const row = await pool.query("SELECT id FROM handshake_challenges WHERE id = $1", [id]);
    expect(row.rows).toHaveLength(0);
  });

  it("returns invalid for an unknown challenge id", async () => {
    const outcome = await claimChallenge(pool, "00000000-0000-0000-0000-000000000000", AGENT_HASH);
    expect(outcome.kind).toBe("invalid");
  });

  it("returns invalid for an expired challenge", async () => {
    const { id } = await freshChallenge({ expiresAt: new Date(Date.now() - 1000) });

    const outcome = await claimChallenge(pool, id, AGENT_HASH);

    expect(outcome.kind).toBe("invalid");
  });

  it("returns invalid when the agentHash does not match the challenge's agentHash, without burning it", async () => {
    const { id } = await freshChallenge({ agentHash: AGENT_HASH });

    const mismatchedOutcome = await claimChallenge(pool, id, OTHER_AGENT_HASH);
    expect(mismatchedOutcome.kind).toBe("invalid");

    const row = await pool.query("SELECT id FROM handshake_challenges WHERE id = $1", [id]);
    expect(row.rows).toHaveLength(1);

    const ownerOutcome = await claimChallenge(pool, id, AGENT_HASH);
    expect(ownerOutcome.kind).toBe("claimed");
  });
});

describe("completeHandshakeBinding", () => {
  it("creates a fresh agent, generates its name, and binds its wallets", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = await completeHandshakeBinding(client, {
        agentHash: AGENT_HASH,
        consentVersion: 1,
        appVersion: null,
        ingestTokenSha256: "token-sha-1",
        wallets: [{ chainFamily: "eip155", addressHmac: "hmac-1", proofSignature: "sig-1" }],
      });
      await client.query("COMMIT");

      expect(outcome.kind).toBe("bound");
      if (outcome.kind !== "bound") throw new Error("expected bound");
      expect(outcome.agentName).toBe(`Vex-${AGENT_HASH.slice(0, 8)}`);

      const agentRow = await pool.query("SELECT name, status, last_handshake_at FROM agents WHERE agent_hash = $1", [
        AGENT_HASH,
      ]);
      expect(agentRow.rows[0].name).toBe(outcome.agentName);
      expect(agentRow.rows[0].status).toBe("active");
      expect(agentRow.rows[0].last_handshake_at).not.toBeNull();

      const walletRow = await pool.query(
        "SELECT agent_hash, proof_signature FROM agent_wallets WHERE chain_family = 'eip155' AND address_hmac = 'hmac-1'",
      );
      expect(walletRow.rows[0].agent_hash).toBe(AGENT_HASH);
      expect(walletRow.rows[0].proof_signature).toBe("sig-1");
    } finally {
      client.release();
    }
  });

  it("extends the generated name to 12 then 16 hex characters on collision", async () => {
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, name) VALUES ($1, 'taken-1', 1, now(), $2)",
      ["1".repeat(64), `Vex-${AGENT_HASH.slice(0, 8)}`],
    );
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, name) VALUES ($1, 'taken-2', 1, now(), $2)",
      ["2".repeat(64), `Vex-${AGENT_HASH.slice(0, 12)}`],
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = await completeHandshakeBinding(client, {
        agentHash: AGENT_HASH,
        consentVersion: 1,
        appVersion: null,
        ingestTokenSha256: "token-sha-collision",
        wallets: [],
      });
      await client.query("COMMIT");

      expect(outcome.kind).toBe("bound");
      if (outcome.kind !== "bound") throw new Error("expected bound");
      expect(outcome.agentName).toBe(`Vex-${AGENT_HASH.slice(0, 16)}`);
    } finally {
      client.release();
    }
  });

  it("upgrades an existing v1 agent, keeping its agentHash and raising consentVersion via GREATEST", async () => {
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, 'old-token-sha', 3, now())",
      [AGENT_HASH],
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = await completeHandshakeBinding(client, {
        agentHash: AGENT_HASH,
        consentVersion: 1,
        appVersion: "9.9.9",
        ingestTokenSha256: "new-token-sha",
        wallets: [],
      });
      await client.query("COMMIT");

      expect(outcome.kind).toBe("bound");
      const agentRow = await pool.query(
        "SELECT consent_version, ingest_token_sha256, app_version FROM agents WHERE agent_hash = $1",
        [AGENT_HASH],
      );
      expect(agentRow.rows[0].consent_version).toBe(3);
      expect(agentRow.rows[0].ingest_token_sha256).toBe("new-token-sha");
      expect(agentRow.rows[0].app_version).toBe("9.9.9");
    } finally {
      client.release();
    }
  });

  it("transfers a wallet to the proving agent when a proof re-binds an address already owned by someone else (rebind happy path)", async () => {
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, 'old-owner-token', 1, now())",
      [OTHER_AGENT_HASH],
    );
    await pool.query(
      "INSERT INTO agent_wallets (agent_hash, chain_family, address_hmac, proof_signature) VALUES ($1, 'eip155', 'hmac-rebind', 'sig-old-owner')",
      [OTHER_AGENT_HASH],
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = await completeHandshakeBinding(client, {
        agentHash: AGENT_HASH,
        consentVersion: 1,
        appVersion: null,
        ingestTokenSha256: "token-sha-new-owner",
        wallets: [{ chainFamily: "eip155", addressHmac: "hmac-rebind", proofSignature: "sig-new-owner" }],
      });
      await client.query("COMMIT");

      expect(outcome.kind).toBe("bound");
    } finally {
      client.release();
    }

    const walletRows = await pool.query(
      "SELECT agent_hash, proof_signature FROM agent_wallets WHERE chain_family = 'eip155' AND address_hmac = 'hmac-rebind'",
    );
    expect(walletRows.rows).toHaveLength(1);
    expect(walletRows.rows[0].agent_hash).toBe(AGENT_HASH);
    expect(walletRows.rows[0].proof_signature).toBe("sig-new-owner");

    const oldOwnerRow = await pool.query("SELECT agent_hash FROM agents WHERE agent_hash = $1", [OTHER_AGENT_HASH]);
    expect(oldOwnerRow.rows).toHaveLength(1);
  });

  it("never resurrects a revoked agent's status or clears revoked_at (defense in depth below the route's own gate)", async () => {
    const revokedAt = new Date(Date.now() - 2 * 3_600_000);
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status, revoked_at) VALUES ($1, 'revoked-token-sha', 1, now(), 'revoked', $2)",
      [AGENT_HASH, revokedAt],
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = await completeHandshakeBinding(client, {
        agentHash: AGENT_HASH,
        consentVersion: 1,
        appVersion: null,
        ingestTokenSha256: "new-token-sha",
        wallets: [],
      });
      await client.query("COMMIT");

      expect(outcome.kind).toBe("bound");
    } finally {
      client.release();
    }

    const agentRow = await pool.query(
      "SELECT status, revoked_at FROM agents WHERE agent_hash = $1",
      [AGENT_HASH],
    );
    expect(agentRow.rows[0].status).toBe("revoked");
    expect(agentRow.rows[0].revoked_at.getTime()).toBe(revokedAt.getTime());
  });

  it("never resurrects a quarantined agent's status or clears quarantined_at (defense in depth below the route's own gate)", async () => {
    const quarantinedAt = new Date(Date.now() - 3_600_000);
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status, quarantined_at) VALUES ($1, 'quarantined-token-sha', 1, now(), 'quarantined', $2)",
      [AGENT_HASH, quarantinedAt],
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = await completeHandshakeBinding(client, {
        agentHash: AGENT_HASH,
        consentVersion: 1,
        appVersion: null,
        ingestTokenSha256: "new-token-sha",
        wallets: [],
      });
      await client.query("COMMIT");

      expect(outcome.kind).toBe("bound");
    } finally {
      client.release();
    }

    const agentRow = await pool.query(
      "SELECT status, quarantined_at FROM agents WHERE agent_hash = $1",
      [AGENT_HASH],
    );
    expect(agentRow.rows[0].status).toBe("quarantined");
    expect(agentRow.rows[0].quarantined_at.getTime()).toBe(quarantinedAt.getTime());
  });

  it("keeps the wallet with the same agent on re-handshake, refreshing only the signature (no transfer)", async () => {
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, 'v1-token-sha', 1, now())",
      [AGENT_HASH],
    );

    const firstClient = await pool.connect();
    try {
      await firstClient.query("BEGIN");
      await completeHandshakeBinding(firstClient, {
        agentHash: AGENT_HASH,
        consentVersion: 1,
        appVersion: null,
        ingestTokenSha256: "token-sha-first",
        wallets: [{ chainFamily: "eip155", addressHmac: "hmac-reprove", proofSignature: "sig-old" }],
      });
      await firstClient.query("COMMIT");
    } finally {
      firstClient.release();
    }

    const secondClient = await pool.connect();
    try {
      await secondClient.query("BEGIN");
      const outcome = await completeHandshakeBinding(secondClient, {
        agentHash: AGENT_HASH,
        consentVersion: 1,
        appVersion: null,
        ingestTokenSha256: "token-sha-second",
        wallets: [{ chainFamily: "eip155", addressHmac: "hmac-reprove", proofSignature: "sig-new" }],
      });
      await secondClient.query("COMMIT");

      expect(outcome.kind).toBe("bound");
    } finally {
      secondClient.release();
    }

    const walletRow = await pool.query(
      "SELECT agent_hash, proof_signature FROM agent_wallets WHERE chain_family = 'eip155' AND address_hmac = 'hmac-reprove'",
    );
    expect(walletRow.rows).toHaveLength(1);
    expect(walletRow.rows[0].agent_hash).toBe(AGENT_HASH);
    expect(walletRow.rows[0].proof_signature).toBe("sig-new");
  });
});

describe("claimWallet — concurrent zero-row race", () => {
  it("resolves two truly concurrent zero-row claims for the same address without throwing, settling on a single owner", async () => {
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, 'racer-a-token', 1, now())",
      [AGENT_HASH],
    );
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, 'racer-b-token', 1, now())",
      [OTHER_AGENT_HASH],
    );

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query("BEGIN");
      await clientB.query("BEGIN");

      const taskA = claimWallet(clientA, AGENT_HASH, {
        chainFamily: "eip155",
        addressHmac: "hmac-race",
        proofSignature: "sig-a",
      }).then(() => clientA.query("COMMIT"));
      const taskB = claimWallet(clientB, OTHER_AGENT_HASH, {
        chainFamily: "eip155",
        addressHmac: "hmac-race",
        proofSignature: "sig-b",
      }).then(() => clientB.query("COMMIT"));

      await expect(Promise.all([taskA, taskB])).resolves.toBeDefined();
    } finally {
      clientA.release();
      clientB.release();
    }

    const walletRows = await pool.query(
      "SELECT agent_hash, proof_signature FROM agent_wallets WHERE chain_family = 'eip155' AND address_hmac = 'hmac-race'",
    );
    expect(walletRows.rows).toHaveLength(1);
    expect([AGENT_HASH, OTHER_AGENT_HASH]).toContain(walletRows.rows[0].agent_hash);
    expect(["sig-a", "sig-b"]).toContain(walletRows.rows[0].proof_signature);
  });
});

describe("lastAcceptedRowIdFor", () => {
  beforeEach(async () => {
    await pool.query(
      "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, 'tok', 1, now())",
      [AGENT_HASH],
    );
  });

  async function seedActivity(sourceRowId: string) {
    await pool.query(
      `INSERT INTO activities
         (agent_hash, source_row_id, public_id, source_execution_id, event_index,
          kind, event_role, status, protocol, chain_family, chain_id,
          client_created_at, statuses_seen, received_schema_version)
       VALUES ($1, $2, $2, '9021', 0, 'swap', 'swap', 'confirmed', 'kyberswap', 'eip155', 8453,
               now(), ARRAY['confirmed'], 1)`,
      [AGENT_HASH, sourceRowId],
    );
  }

  it("returns null when the agent has no activities", async () => {
    expect(await lastAcceptedRowIdFor(pool, AGENT_HASH)).toBeNull();
  });

  it("returns the numerically greatest source_row_id, not the lexicographically greatest", async () => {
    await seedActivity("9");
    await seedActivity("10");

    expect(await lastAcceptedRowIdFor(pool, AGENT_HASH)).toBe("10");
  });
});

describe("deleteExpiredHandshakeChallenges", () => {
  it("deletes challenges created more than an hour ago and keeps recent ones", async () => {
    const { id: oldId } = await freshChallenge();
    await pool.query("UPDATE handshake_challenges SET created_at = now() - interval '2 hours' WHERE id = $1", [
      oldId,
    ]);
    const { id: recentId } = await freshChallenge();

    const deletedCount = await deleteExpiredHandshakeChallenges(pool);

    expect(deletedCount).toBe(1);
    const remaining = await pool.query("SELECT id FROM handshake_challenges");
    expect(remaining.rows.map((row: { id: string }) => row.id)).toEqual([recentId]);
  });
});
