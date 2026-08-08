import {
  handshakeChallengeTemplate,
  handshakeSessionCompleteRequestSchema,
  handshakeSessionStartRequestSchema,
  type ChainFamily,
  type HandshakeProof,
} from "@agentscan/contract";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { Deps } from "../app.js";
import { proofVerifierFor } from "../handshake/proof-verifiers.js";
import { randomBase64UrlToken } from "../handshake/tokens.js";
import { addressHmacHex, normalizeHandshakeAddress } from "../handshake/wallet-hmac.js";
import { bearerTokenFrom, sha256Hex } from "../plugins/auth.js";
import { rateLimitKeyHash } from "../plugins/rate-limit-key.js";
import {
  claimChallenge,
  completeHandshakeBinding,
  existingAgentTokenSha256,
  insertChallenge,
  lastAcceptedRowIdFor,
  type ClaimedChallenge,
} from "../repos/handshake-repo.js";
import { PostgresSlidingWindowLimiter } from "../repos/rate-limit-repo.js";

const sendError = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message } });

const NONCE_BYTES = 32;
const INGEST_TOKEN_BYTES = 32;
const ISSUED_AT_CLOCK_SKEW_TOLERANCE_MS = 60_000;

function addressHmacFor(pepper: string, chainFamily: ChainFamily, address: string): string {
  return addressHmacHex(pepper, chainFamily, normalizeHandshakeAddress(chainFamily, address));
}

function sameAddressHmacSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function isWithinIssuedAtWindow(issuedAt: string, challenge: ClaimedChallenge): boolean {
  const issuedAtMs = new Date(issuedAt).getTime();
  if (Number.isNaN(issuedAtMs)) return false;
  return (
    issuedAtMs >= challenge.createdAt.getTime() - ISSUED_AT_CLOCK_SKEW_TOLERANCE_MS &&
    issuedAtMs <= challenge.expiresAt.getTime()
  );
}

async function verifyProof(proof: HandshakeProof, agentHash: string, challenge: ClaimedChallenge): Promise<boolean> {
  if (!isWithinIssuedAtWindow(proof.issuedAt, challenge)) return false;
  const normalizedAddress = normalizeHandshakeAddress(proof.chainFamily, proof.address);
  const template = handshakeChallengeTemplate({
    domain: challenge.domain,
    agentHash,
    address: normalizedAddress,
    chainFamily: proof.chainFamily,
    nonce: challenge.nonce,
    issuedAt: proof.issuedAt,
  });
  return proofVerifierFor(proof.chainFamily).verify({
    template,
    address: normalizedAddress,
    signature: proof.signature,
  });
}

async function requireAuthorizedForExistingAgent(
  deps: Deps,
  agentHash: string,
  authorizationHeader: string | undefined,
): Promise<boolean> {
  const existingTokenSha256 = await existingAgentTokenSha256(deps.pool, agentHash);
  if (existingTokenSha256 === null) return true;
  const bearerToken = bearerTokenFrom(authorizationHeader);
  return bearerToken !== null && sha256Hex(bearerToken) === existingTokenSha256;
}

export const handshakeRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const startLimiter = new PostgresSlidingWindowLimiter(
    deps.pool,
    deps.config.HANDSHAKE_RATE_LIMIT_PER_IP,
    deps.config.HANDSHAKE_RATE_WINDOW_SEC,
  );

  app.post("/v2/agents/session/start", async (request, reply) => {
    const rateDecision = await startLimiter.allow(
      rateLimitKeyHash("handshake_start", request.ip, deps.config.RATE_LIMIT_KEY_SALT),
    );
    if (!rateDecision.ok) {
      return reply
        .status(429)
        .header("retry-after", String(rateDecision.retryAfterSec))
        .send({ error: { code: "rate_limited", message: "too many handshake session requests" } });
    }
    const parsed = handshakeSessionStartRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "validation_failed", "session start body failed validation");
    }
    const addressHmacs = parsed.data.addresses.map((entry) =>
      addressHmacFor(deps.config.WALLET_HMAC_PEPPER, entry.chainFamily, entry.address),
    );
    const nonce = randomBase64UrlToken(NONCE_BYTES);
    const expiresAt = new Date(Date.now() + deps.config.HANDSHAKE_CHALLENGE_TTL_MIN * 60_000);
    const domain = deps.config.HANDSHAKE_DOMAIN;
    const { id } = await insertChallenge(deps.pool, {
      agentHash: parsed.data.agentHash,
      nonce,
      domain,
      addressHmacs,
      expiresAt,
    });
    return { challengeId: id, nonce, domain, expiresAt: expiresAt.toISOString() };
  });

  app.post("/v2/agents/session/complete", async (request, reply) => {
    const parsed = handshakeSessionCompleteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "validation_failed", "session complete body failed validation");
    }
    const { challengeId, agentHash, consentVersion, appVersion, proofs } = parsed.data;

    const claimOutcome = await claimChallenge(deps.pool, challengeId, agentHash);
    if (claimOutcome.kind !== "claimed") {
      return sendError(
        reply,
        400,
        "challenge_expired",
        "challenge is missing, expired, already used, or does not match the agent",
      );
    }
    const { challenge } = claimOutcome;

    const authorized = await requireAuthorizedForExistingAgent(deps, agentHash, request.headers.authorization);
    if (!authorized) {
      return sendError(reply, 401, "unauthorized", "existing agent requires its current ingest token");
    }

    const proofBindings = proofs.map((proof) => ({
      chainFamily: proof.chainFamily,
      addressHmac: addressHmacFor(deps.config.WALLET_HMAC_PEPPER, proof.chainFamily, proof.address),
      proofSignature: proof.signature,
    }));
    const proofAddressHmacs = proofBindings.map((binding) => binding.addressHmac);
    if (!sameAddressHmacSet(proofAddressHmacs, challenge.addressHmacs)) {
      return sendError(reply, 400, "invalid_signature", "proofs do not cover the challenge's address set");
    }

    for (const proof of proofs) {
      const verified = await verifyProof(proof, agentHash, challenge);
      if (!verified) {
        return sendError(reply, 400, "invalid_signature", "proof signature verification failed");
      }
    }

    const ingestToken = randomBase64UrlToken(INGEST_TOKEN_BYTES);
    const client = await deps.pool.connect();
    try {
      await client.query("BEGIN");
      const bindOutcome = await completeHandshakeBinding(client, {
        agentHash,
        consentVersion,
        appVersion: appVersion ?? null,
        ingestTokenSha256: sha256Hex(ingestToken),
        wallets: proofBindings,
      });
      if (bindOutcome.kind === "wallet_conflict") {
        await client.query("ROLLBACK");
        return sendError(reply, 409, "wallet_conflict", "an address is already bound to a different agent");
      }
      await client.query("COMMIT");
      const syncState = { lastAcceptedRowId: await lastAcceptedRowIdFor(deps.pool, agentHash) };
      return { status: "bound", ingestToken, agentName: bindOutcome.agentName, syncState };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
};
