import { canonicalAttestMessage } from "@agentscan/contract";
import type { FastifyInstance } from "fastify";
import { pino } from "pino";
import { encodeAbiParameters, parseAbiParameters, toEventSelector, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AttestationChainRegistry, ChainReader } from "@agentscan/core";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";
import { runAttestationVerificationPass, type AttestationVerificationLoopDeps } from "../../worker/attestation-loop.js";

const trenchChainId = 4663n;
const factoryAddress = "0x3857c6c4fe93abb40945dfc8b9d690384cbae014";
const registryWithFactory: AttestationChainRegistry = new Map([[trenchChainId, { factoryAddresses: [factoryAddress] }]]);

const TOKEN_CREATED_TOPIC0 = toEventSelector("TokenCreated(address,address,uint8,uint8,bytes,uint256)");
const TOKEN_CREATED_PARAMS = parseAbiParameters(
  "address token, address creator, uint8 strategy, uint8 dex, bytes data, uint256 price",
);

function tokenCreatedLog(token: string, creator: string, emitter: string = factoryAddress) {
  const data = encodeAbiParameters(TOKEN_CREATED_PARAMS, [token as Hex, creator as Hex, 0, 0, "0x", 1n]);
  return { address: emitter, topics: [TOKEN_CREATED_TOPIC0], data };
}

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
    ATTEST_MAX_PENDING_PER_IP: "1000",
    ATTEST_MAX_PENDING_GLOBAL: "1000",
  });
  app = await buildApp({ pool: db.pool, config, resolveChain: () => null });
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.stop();
});

beforeEach(async () => {
  await db.pool.query("DELETE FROM token_attestations");
});

const attest = (payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/v1/tokens/attest",
    payload: payload as object,
    remoteAddress: "203.0.113.77",
  });

const getAttestation = (chainId: bigint, address: string) =>
  app.inject({ method: "GET", url: `/v1/tokens/${chainId}/${address}` });

const chainEntry = {
  canonicalSlug: "robinhood",
  displayName: "Robinhood Chain",
  explorerTxUrl: () => null,
  rpcUrls: [],
  verificationTier: "full" as const,
};

function loopDeps(overrides: Partial<AttestationVerificationLoopDeps> = {}): AttestationVerificationLoopDeps {
  return {
    pool: db.pool,
    config: loadConfig({ DATABASE_URL: "postgres://unused-in-tests", ATTEST_BACKOFF_SCHEDULE: "1m,5m" }),
    now: () => new Date(),
    resolveChain: () => chainEntry,
    chainReaderFor: () => ({ getReceipt: async () => null }),
    chainRegistry: registryWithFactory,
    logger: pino({ level: "silent" }),
    ...overrides,
  };
}

async function verifyStatusOf(tokenAddress: string): Promise<{ verify_status: string; next_attempt_at: Date }> {
  const result = await db.pool.query<{ verify_status: string; next_attempt_at: Date }>(
    "SELECT verify_status, next_attempt_at FROM token_attestations WHERE token_address = $1",
    [tokenAddress],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("expected exactly one row");
  return row;
}

describe("attestation verification worker pass", () => {
  it("flips a POSTed attestation to verified via a stub reader, and GET reflects recommended true with the derived hash", async () => {
    const tokenAddress = randomTokenAddress();
    const { account, attestSignature } = await signedAttestation(trenchChainId, tokenAddress);
    const txHash = `0x${"7".repeat(64)}`;

    const postResponse = await attest({ chainId: Number(trenchChainId), tokenAddress, attestSignature, txHash });
    expect(postResponse.statusCode).toBe(200);

    const reader: ChainReader = {
      getReceipt: async () => ({
        status: "success",
        blockTimestamp: new Date(),
        blockNumber: 100n,
        erc20Transfers: [],
        logs: [tokenCreatedLog(tokenAddress, account.address)],
      }),
      getHeadBlockNumber: async () => 105n,
    };

    const claimed = await runAttestationVerificationPass(loopDeps({ chainReaderFor: () => reader }));
    expect(claimed).toBe(1);

    const getResponse = await getAttestation(trenchChainId, tokenAddress);
    expect(getResponse.json()).toMatchObject({
      status: "verified",
      recommended: true,
      signals: ["creator_attested", "onchain_verified"],
      txHash,
    });
  });

  it("finalizes a POSTed attestation as mismatch creator_mismatch when the on-chain creator differs from the signer", async () => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);
    const txHash = `0x${"8".repeat(64)}`;
    const someoneElse = `0x${"e".repeat(40)}`;

    await attest({ chainId: Number(trenchChainId), tokenAddress, attestSignature, txHash });

    const reader: ChainReader = {
      getReceipt: async () => ({
        status: "success",
        blockTimestamp: new Date(),
        blockNumber: 100n,
        erc20Transfers: [],
        logs: [tokenCreatedLog(tokenAddress, someoneElse)],
      }),
      getHeadBlockNumber: async () => 105n,
    };

    await runAttestationVerificationPass(loopDeps({ chainReaderFor: () => reader }));

    const getResponse = await getAttestation(trenchChainId, tokenAddress);
    expect(getResponse.json()).toMatchObject({ status: "mismatch", recommended: false, signals: ["creator_attested"] });
  });

  it("reschedules rather than terminalizing when the attestation has no tx hash hint yet", async () => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(trenchChainId, tokenAddress);

    await attest({ chainId: Number(trenchChainId), tokenAddress, attestSignature });

    const claimed = await runAttestationVerificationPass(loopDeps());
    expect(claimed).toBe(1);

    const row = await verifyStatusOf(tokenAddress);
    expect(row.verify_status).toBe("unverified");
    expect(row.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
  });

  it("never claims a revoked row even though it is still nominally unverified", async () => {
    const tokenAddress = randomTokenAddress();
    const { account, attestSignature } = await signedAttestation(trenchChainId, tokenAddress);
    await db.pool.query(
      `INSERT INTO token_attestations
         (chain_id, token_address, recovered_signer, attest_signature, tx_hash_hint, revoked_at, revoke_reason)
       VALUES ($1, $2, $3, $4, $5, now(), 'creator requested removal')`,
      [trenchChainId.toString(), tokenAddress, account.address.toLowerCase(), attestSignature, `0x${"9".repeat(64)}`],
    );

    const reader: ChainReader = {
      getReceipt: async () => {
        throw new Error("the worker must never call the reader for a revoked row");
      },
    };
    const claimed = await runAttestationVerificationPass(loopDeps({ chainReaderFor: () => reader }));
    expect(claimed).toBe(0);

    const row = await verifyStatusOf(tokenAddress);
    expect(row.verify_status).toBe("unverified");
  });
});
