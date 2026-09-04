import { canonicalAttestMessage } from "@agentscan/contract";
import type { FastifyInstance } from "fastify";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../config.js";
import { startTestDb } from "../../testing/pg-harness.js";

/**
 * The launchpad, carried through the real route into the real table and back out of the read.
 *
 * The two facts this has to pin: the field is OPTIONAL on the wire and defaults to `trench`, which
 * is what makes an old client and a new server compatible; and it is part of the SUPPORT decision,
 * so the chain alone no longer answers "can this be attested here" - chain 4663 hosts three
 * launchpads and Base hosts one.
 */
const ROBINHOOD = 4663n;
const BASE = 8453n;
const requestIp = "203.0.113.11";

function randomTokenAddress(): string {
  return `0x${generatePrivateKey().slice(2, 42)}`;
}

async function signedAttestation(chainId: bigint, tokenAddress: string) {
  const account = privateKeyToAccount(generatePrivateKey());
  const attestSignature = await account.signMessage({
    message: canonicalAttestMessage(chainId, tokenAddress),
  });
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

const attest = (payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/v1/tokens/attest",
    payload: payload as object,
    remoteAddress: requestIp,
  });

const storedLaunchpad = async (tokenAddress: string) => {
  const result = await db.pool.query<{ launchpad: string }>(
    "SELECT launchpad FROM token_attestations WHERE token_address = $1",
    [tokenAddress.toLowerCase()],
  );
  return result.rows[0]?.launchpad;
};

describe("POST /v1/tokens/attest with a launchpad", () => {
  // The compatibility case: this body is byte-identical to what every client shipped before the
  // field existed sends, and every row already in the table is a Trench attestation.
  it("defaults a body with no launchpad to trench", async () => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(ROBINHOOD, tokenAddress);

    const response = await attest({ chainId: 4663, tokenAddress, attestSignature });

    expect(response.statusCode).toBe(200);
    expect(await storedLaunchpad(tokenAddress)).toBe("trench");
  });

  it.each([
    ["pools_fun", 4663],
    ["virtuals", 4663],
    ["virtuals", 8453],
  ] as const)("stores an explicit %s claim on chain %s", async (launchpad, chainId) => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(BigInt(chainId), tokenAddress);

    const response = await attest({ chainId, tokenAddress, launchpad, attestSignature });

    expect(response.statusCode).toBe(200);
    expect(await storedLaunchpad(tokenAddress)).toBe(launchpad);
  });

  // Support is a property of the PAIR. Base hosts Virtuals and nothing else, so a Trench or
  // pools.fun claim there has no allowlist to be proved against and is refused at the door rather
  // than queued to fail later.
  it.each(["trench", "pools_fun"] as const)("refuses a %s claim on Base", async (launchpad) => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(BASE, tokenAddress);

    const response = await attest({ chainId: 8453, tokenAddress, launchpad, attestSignature });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "chain_unsupported" } });
    expect(await storedLaunchpad(tokenAddress)).toBeUndefined();
  });

  it("refuses a chain that hosts no launchpad at all", async () => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(1n, tokenAddress);

    const response = await attest({ chainId: 1, tokenAddress, launchpad: "virtuals", attestSignature });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "chain_unsupported" } });
  });

  // An unrecognised launchpad is a validation failure, never a silent fall back to the default:
  // verifying a claim under the wrong proof is the confusion the field exists to remove.
  it("refuses an unknown launchpad rather than defaulting it", async () => {
    const tokenAddress = randomTokenAddress();
    const { attestSignature } = await signedAttestation(ROBINHOOD, tokenAddress);

    const response = await attest({
      chainId: 4663,
      tokenAddress,
      launchpad: "uniswap",
      attestSignature,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "validation_failed" } });
  });

  it("serves the launchpad back on the public read", async () => {
    const tokenAddress = randomTokenAddress();
    const { account, attestSignature } = await signedAttestation(ROBINHOOD, tokenAddress);
    await attest({ chainId: 4663, tokenAddress, launchpad: "pools_fun", attestSignature });

    const read = await app.inject({ method: "GET", url: `/v1/tokens/4663/${tokenAddress}` });

    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      launchpad: "pools_fun",
      creatorAddress: account.address.toLowerCase(),
      status: "unverified",
    });
  });
});
