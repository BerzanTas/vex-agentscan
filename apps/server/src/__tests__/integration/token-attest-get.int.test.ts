import { canonicalAttestMessage } from "@agentscan/contract";
import type { FastifyInstance } from "fastify";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";

const trenchChainId = 4663n;

function randomTokenAddress(): string {
  return `0x${generatePrivateKey().slice(2, 42)}`;
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  db = await startTestDb();
  const config = loadConfig({ DATABASE_URL: "postgres://unused-in-tests" });
  app = await buildApp({ pool: db.pool, config, resolveChain: () => null });
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

async function insertAttestation(tokenAddress: string, overrides: Record<string, unknown> = {}) {
  const account = privateKeyToAccount(generatePrivateKey());
  const message = canonicalAttestMessage(trenchChainId, tokenAddress);
  const attestSignature = await account.signMessage({ message });
  const columns = {
    chain_id: trenchChainId.toString(),
    token_address: tokenAddress,
    recovered_signer: account.address.toLowerCase(),
    attest_signature: attestSignature,
    ...overrides,
  };
  const keys = Object.keys(columns);
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
  await db.pool.query(
    `INSERT INTO token_attestations (${keys.join(", ")}) VALUES (${placeholders})`,
    keys.map((key) => columns[key as keyof typeof columns]),
  );
  return { account, attestSignature };
}

const getAttestation = (chainId: bigint | string, address: string) =>
  app.inject({ method: "GET", url: `/v1/tokens/${chainId}/${address}` });

describe("GET /v1/tokens/:chainId/:address", () => {
  it("returns 404 not_found with no-store for an unknown token", async () => {
    const response = await getAttestation(trenchChainId, randomTokenAddress());

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("reports unverified with only the creator_attested signal and a null txHash", async () => {
    const tokenAddress = randomTokenAddress();
    const { account } = await insertAttestation(tokenAddress);

    const response = await getAttestation(trenchChainId, tokenAddress);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      chainId: Number(trenchChainId),
      tokenAddress,
      status: "unverified",
      signals: ["creator_attested"],
      recommended: false,
      creatorAddress: account.address.toLowerCase(),
      txHash: null,
      verifiedAt: null,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["access-control-allow-origin"]).toBe("*");
  });

  it("reports verified with both signals and echoes the derived hash after the row is verified", async () => {
    const tokenAddress = randomTokenAddress();
    const derivedTxHash = `0x${"9".repeat(64)}`;
    const { account, attestSignature } = await insertAttestation(tokenAddress, {
      verify_status: "verified",
      derived_tx_hash: derivedTxHash,
      verified_at: "2026-01-05T00:00:00.000Z",
    });

    const response = await getAttestation(trenchChainId, tokenAddress);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      chainId: Number(trenchChainId),
      tokenAddress,
      status: "verified",
      signals: ["creator_attested", "onchain_verified"],
      recommended: true,
      creatorAddress: account.address.toLowerCase(),
      txHash: derivedTxHash,
      attestSignature,
      verifiedAt: "2026-01-05T00:00:00.000Z",
    });
    expect(response.headers["cache-control"]).toBe("public, max-age=300, must-revalidate");
    expect(response.headers["access-control-allow-origin"]).toBe("*");
  });

  it("never echoes the unvalidated tx_hash_hint, only the derived hash", async () => {
    const tokenAddress = randomTokenAddress();
    await insertAttestation(tokenAddress, { tx_hash_hint: `0x${"5".repeat(64)}` });

    const response = await getAttestation(trenchChainId, tokenAddress);

    expect(response.json().txHash).toBeNull();
  });

  it("reports revoked for a revoked row when it is the only candidate", async () => {
    const tokenAddress = randomTokenAddress();
    await insertAttestation(tokenAddress, {
      verify_status: "verified",
      revoked_at: "2026-01-06T00:00:00.000Z",
      revoke_reason: "creator requested removal",
    });

    const response = await getAttestation(trenchChainId, tokenAddress);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "revoked", signals: [], recommended: false });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("prefers a live verified row over another signer's revoked row for the same token", async () => {
    const tokenAddress = randomTokenAddress();
    await insertAttestation(tokenAddress, {
      verify_status: "verified",
      revoked_at: "2026-01-06T00:00:00.000Z",
    });
    const { account: liveAccount } = await insertAttestation(tokenAddress, { verify_status: "verified" });

    const response = await getAttestation(trenchChainId, tokenAddress);

    expect(response.json()).toMatchObject({
      status: "verified",
      creatorAddress: liveAccount.address.toLowerCase(),
    });
  });

  it("responds 404 not_found for a malformed chainId path segment", async () => {
    const response = await getAttestation("not-a-chain-id", randomTokenAddress());

    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("answers OPTIONS with CORS headers scoped to GET and OPTIONS", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: `/v1/tokens/${trenchChainId}/${randomTokenAddress()}`,
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-methods"]).toBe("GET, OPTIONS");
  });
});
