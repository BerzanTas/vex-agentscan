import { canonicalAttestMessage } from "@agentscan/contract";
import type { FastifyInstance } from "fastify";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";

const trenchChainId = 4663n;
const unsupportedChainId = 1n;
const requestIp = "203.0.113.10";

function randomTokenAddress(): string {
  return `0x${generatePrivateKey().slice(2, 42)}`;
}

async function signedAttestation(chainId: bigint, tokenAddress: string) {
  const account = privateKeyToAccount(generatePrivateKey());
  const message = canonicalAttestMessage(chainId, tokenAddress);
  const attestSignature = await account.signMessage({ message });
  return { account, attestSignature };
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  db = await startTestDb();
  const config = loadConfig({
    DATABASE_URL: "postgres://unused-in-tests",
    ATTEST_RATE_LIMIT_PER_IP: "1000",
    ATTEST_RATE_WINDOW_SEC: "3600",
    ATTEST_MAX_PENDING_PER_IP: "1000",
    ATTEST_MAX_PENDING_GLOBAL: "1000",
  });
  app = await buildApp({ pool: db.pool, config, resolveChain: () => null });
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

const attest = (payload: unknown, options: { remoteAddress?: string; authorization?: string } = {}) =>
  app.inject({
    method: "POST",
    url: "/v1/tokens/attest",
    payload: payload as object,
    remoteAddress: options.remoteAddress ?? requestIp,
    headers: options.authorization ? { authorization: options.authorization } : {},
  });

const attestationRows = (tokenAddress: string) =>
  db.pool.query("SELECT * FROM token_attestations WHERE token_address = $1 ORDER BY id", [tokenAddress]);

describe("POST /v1/tokens/attest", () => {
  it("accepts a valid attestation and stores an unverified row", async () => {
    const tokenAddress = randomTokenAddress();
    const { account, attestSignature } = await signedAttestation(trenchChainId, tokenAddress);

    const response = await attest({
      chainId: Number(trenchChainId),
      tokenAddress,
      attestSignature,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "accepted", verifyStatus: "unverified" });
    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].verify_status).toBe("unverified");
    expect(rows.rows[0].recovered_signer).toBe(account.address.toLowerCase());
    expect(rows.rows[0].chain_id).toBe(trenchChainId.toString());
  });

  it("stores the token address lowercased even when submitted mixed-case", async () => {
    const tokenAddress = randomTokenAddress();
    const mixedCaseAddress = `0x${tokenAddress.slice(2, 6).toUpperCase()}${tokenAddress.slice(6)}`;
    const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);

    const response = await attest({
      chainId: Number(trenchChainId),
      tokenAddress: mixedCaseAddress,
      attestSignature,
    });

    expect(response.statusCode).toBe(200);
    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].token_address).toBe(tokenAddress);
  });

  it("accepts an optional txHash as the hint, not the derived hash", async () => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);
    const txHash = `0x${"7".repeat(64)}`;

    const response = await attest({
      chainId: Number(trenchChainId),
      tokenAddress,
      attestSignature,
      txHash,
    });

    expect(response.statusCode).toBe(200);
    const rows = await attestationRows(tokenAddress);
    expect(rows.rows[0].tx_hash_hint).toBe(txHash);
    expect(rows.rows[0].derived_tx_hash).toBeNull();
  });

  it("is idempotent for a repeat submission from the same signer: single row, 200", async () => {
    const tokenAddress = randomTokenAddress();
    const account = privateKeyToAccount(generatePrivateKey());
    const message = canonicalAttestMessage(trenchChainId, tokenAddress);
    const attestSignature = await account.signMessage({ message });

    const first = await attest({ chainId: Number(trenchChainId), tokenAddress, attestSignature });
    expect(first.statusCode).toBe(200);

    const second = await attest({ chainId: Number(trenchChainId), tokenAddress, attestSignature });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: "accepted", verifyStatus: "unverified" });

    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(1);
  });

  it("keeps tx_hash_hint write-once: a replayed signature with a different txHash never overwrites it", async () => {
    const tokenAddress = randomTokenAddress();
    const account = privateKeyToAccount(generatePrivateKey());
    const message = canonicalAttestMessage(trenchChainId, tokenAddress);
    const attestSignature = await account.signMessage({ message });
    const firstTxHash = `0x${"1".repeat(64)}`;
    const replayedTxHash = `0x${"2".repeat(64)}`;

    const first = await attest({
      chainId: Number(trenchChainId),
      tokenAddress,
      attestSignature,
      txHash: firstTxHash,
    });
    expect(first.statusCode).toBe(200);

    const replay = await attest({
      chainId: Number(trenchChainId),
      tokenAddress,
      attestSignature,
      txHash: replayedTxHash,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ status: "accepted", verifyStatus: "unverified" });

    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].tx_hash_hint).toBe(firstTxHash);
  });

  it("fills a null tx_hash_hint on a later submission that does carry one", async () => {
    const tokenAddress = randomTokenAddress();
    const account = privateKeyToAccount(generatePrivateKey());
    const message = canonicalAttestMessage(trenchChainId, tokenAddress);
    const attestSignature = await account.signMessage({ message });
    const laterTxHash = `0x${"3".repeat(64)}`;

    const first = await attest({ chainId: Number(trenchChainId), tokenAddress, attestSignature });
    expect(first.statusCode).toBe(200);
    expect((await attestationRows(tokenAddress)).rows[0].tx_hash_hint).toBeNull();

    const second = await attest({
      chainId: Number(trenchChainId),
      tokenAddress,
      attestSignature,
      txHash: laterTxHash,
    });
    expect(second.statusCode).toBe(200);

    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].tx_hash_hint).toBe(laterTxHash);
  });

  it("gives a different signer for the same token its own row (anti-squatting)", async () => {
    const tokenAddress = randomTokenAddress();
    const first = await signedAttestation(trenchChainId, tokenAddress);
    const second = await signedAttestation(trenchChainId, tokenAddress);

    const firstResponse = await attest({
      chainId: Number(trenchChainId),
      tokenAddress,
      attestSignature: first.attestSignature,
    });
    const secondResponse = await attest({
      chainId: Number(trenchChainId),
      tokenAddress,
      attestSignature: second.attestSignature,
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(2);
    const signers = rows.rows.map((row) => row.recovered_signer).sort();
    expect(signers).toEqual(
      [first.account.address.toLowerCase(), second.account.address.toLowerCase()].sort(),
    );
  });

  it("rejects an invalid signature with 400 invalid_signature and persists zero rows", async () => {
    const tokenAddress = randomTokenAddress();

    const response = await attest({
      chainId: Number(trenchChainId),
      tokenAddress,
      attestSignature: `0x${"a".repeat(130)}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_signature");
    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(0);
  });

  it("recomputes the canonical message from the submitted params, ignoring the address the client signed for", async () => {
    const tokenAddress = randomTokenAddress();
    const otherTokenAddress = randomTokenAddress();
    const { account, attestSignature } = await signedAttestation(trenchChainId, otherTokenAddress);

    const response = await attest({
      chainId: Number(trenchChainId),
      tokenAddress,
      attestSignature,
    });

    expect(response.statusCode).toBe(200);
    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].recovered_signer).not.toBe(account.address.toLowerCase());
  });

  it("rejects a malformed body with 400 validation_failed", async () => {
    const response = await attest({ chainId: "not-a-number", tokenAddress: "bad" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation_failed");
  });

  it("rejects a chainId outside the attestation registry with 400 chain_unsupported", async () => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(unsupportedChainId, tokenAddress);

    const response = await attest({
      chainId: Number(unsupportedChainId),
      tokenAddress,
      attestSignature,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("chain_unsupported");
    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(0);
  });

  it("ignores a bearer Authorization header entirely: no auth is required or checked", async () => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);

    const response = await attest(
      { chainId: Number(trenchChainId), tokenAddress, attestSignature },
      { authorization: "Bearer definitely-not-a-real-token" },
    );

    expect(response.statusCode).toBe(200);
  });

  it("never stores the requester's raw IP address anywhere", async () => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);

    await attest({ chainId: Number(trenchChainId), tokenAddress, attestSignature });

    const rows = await attestationRows(tokenAddress);
    expect(rows.rows[0].submitter_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.rows[0].submitter_ip_hash).not.toContain(requestIp);
  });
});

describe("POST /v1/tokens/attest anti-abuse limits", () => {
  it("rate limits repeated requests from the same IP with 429 rate_limited and Retry-After", async () => {
    const limitedIp = "203.0.113.20";
    const config = loadConfig({
      DATABASE_URL: "postgres://unused-in-tests",
      ATTEST_RATE_LIMIT_PER_IP: "3",
      ATTEST_RATE_WINDOW_SEC: "3600",
      ATTEST_MAX_PENDING_PER_IP: "1000",
      ATTEST_MAX_PENDING_GLOBAL: "1000",
    });
    const limitedApp = await buildApp({ pool: db.pool, config, resolveChain: () => null });

    for (let i = 0; i < 3; i++) {
      const tokenAddress = randomTokenAddress();
      const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);
      const response = await limitedApp.inject({
        method: "POST",
        url: "/v1/tokens/attest",
        remoteAddress: limitedIp,
        payload: { chainId: Number(trenchChainId), tokenAddress, attestSignature },
      });
      expect(response.statusCode).toBe(200);
    }

    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);
    const fourth = await limitedApp.inject({
      method: "POST",
      url: "/v1/tokens/attest",
      remoteAddress: limitedIp,
      payload: { chainId: Number(trenchChainId), tokenAddress, attestSignature },
    });

    expect(fourth.statusCode).toBe(429);
    expect(fourth.json().error.code).toBe("rate_limited");
    expect(Number(fourth.headers["retry-after"])).toBeGreaterThanOrEqual(1);

    await limitedApp.close();
  });

  it("caps outstanding-unverified rows per IP with 429 rate_limited and Retry-After", async () => {
    const cappedIp = "203.0.113.30";
    const config = loadConfig({
      DATABASE_URL: "postgres://unused-in-tests",
      ATTEST_RATE_LIMIT_PER_IP: "1000",
      ATTEST_RATE_WINDOW_SEC: "3600",
      ATTEST_MAX_PENDING_PER_IP: "2",
      ATTEST_MAX_PENDING_GLOBAL: "1000",
    });
    const cappedApp = await buildApp({ pool: db.pool, config, resolveChain: () => null });

    for (let i = 0; i < 2; i++) {
      const tokenAddress = randomTokenAddress();
      const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);
      const response = await cappedApp.inject({
        method: "POST",
        url: "/v1/tokens/attest",
        remoteAddress: cappedIp,
        payload: { chainId: Number(trenchChainId), tokenAddress, attestSignature },
      });
      expect(response.statusCode).toBe(200);
    }

    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);
    const third = await cappedApp.inject({
      method: "POST",
      url: "/v1/tokens/attest",
      remoteAddress: cappedIp,
      payload: { chainId: Number(trenchChainId), tokenAddress, attestSignature },
    });

    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe("rate_limited");
    expect(Number(third.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(0);

    await cappedApp.close();
  });

  it("caps outstanding-unverified rows globally with 429 rate_limited, independent of any single IP's cap", async () => {
    const baseline = await db.pool.query<{ pending_count: string }>(
      "SELECT COUNT(*)::text AS pending_count FROM token_attestations WHERE verify_status = 'unverified' AND revoked_at IS NULL",
    );
    const globalCap = Number(baseline.rows[0]?.pending_count ?? "0") + 2;
    const config = loadConfig({
      DATABASE_URL: "postgres://unused-in-tests",
      ATTEST_RATE_LIMIT_PER_IP: "1000",
      ATTEST_RATE_WINDOW_SEC: "3600",
      ATTEST_MAX_PENDING_PER_IP: "1000",
      ATTEST_MAX_PENDING_GLOBAL: String(globalCap),
    });
    const cappedApp = await buildApp({ pool: db.pool, config, resolveChain: () => null });
    const contributingIps = ["203.0.113.40", "203.0.113.41"];

    for (const ip of contributingIps) {
      const tokenAddress = randomTokenAddress();
      const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);
      const response = await cappedApp.inject({
        method: "POST",
        url: "/v1/tokens/attest",
        remoteAddress: ip,
        payload: { chainId: Number(trenchChainId), tokenAddress, attestSignature },
      });
      expect(response.statusCode).toBe(200);
    }

    const thirdIp = "203.0.113.42";
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);
    const third = await cappedApp.inject({
      method: "POST",
      url: "/v1/tokens/attest",
      remoteAddress: thirdIp,
      payload: { chainId: Number(trenchChainId), tokenAddress, attestSignature },
    });

    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe("rate_limited");
    expect(Number(third.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    const rows = await attestationRows(tokenAddress);
    expect(rows.rows).toHaveLength(0);

    await cappedApp.close();
  });
});
