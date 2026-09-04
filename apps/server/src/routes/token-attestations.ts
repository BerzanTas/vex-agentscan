import { attestRequestSchema, canonicalAttestMessage } from "@agentscan/contract";
import {
  attestationLaunchpadSupported,
  attestationSignalsFor,
  bestAttestationCandidate,
  buildAttestationChainRegistry,
  displayStatusOf,
} from "@agentscan/core";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { Hex } from "viem";
import type { Deps } from "../app.js";
import { recoverAttestSigner } from "../attestation/recover-attest-signer.js";
import { rateLimitKeyHash } from "../plugins/rate-limit-key.js";
import { PostgresSlidingWindowLimiter } from "../repos/rate-limit-repo.js";
import {
  attestationCandidatesFor,
  submitAttestation,
  type AttestationCandidateRow,
} from "../repos/token-attestations-repo.js";

const sendError = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message } });

const sendRateLimited = (reply: FastifyReply, retryAfterSec: number, message: string) =>
  reply.status(429).header("retry-after", String(retryAfterSec)).send({ error: { code: "rate_limited", message } });

const INT8_MAX = 9223372036854775807n;

function chainIdFromParam(raw: string): bigint | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const chainId = BigInt(raw);
  return chainId > INT8_MAX ? null : chainId;
}

function tokenAddressFromParam(raw: string): string | null {
  return /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw.toLowerCase() : null;
}

function attestationDto(chainId: bigint, tokenAddress: string, best: AttestationCandidateRow) {
  const status = displayStatusOf(best);
  return {
    chainId: Number(chainId),
    tokenAddress,
    launchpad: best.launchpad,
    status,
    signals: attestationSignalsFor(status),
    recommended: status === "verified",
    creatorAddress: best.recoveredSigner,
    txHash: best.derivedTxHash,
    attestSignature: best.attestSignature,
    attestedAt: best.firstSeenAt.toISOString(),
    verifiedAt: best.verifiedAt === null ? null : best.verifiedAt.toISOString(),
  };
}

export const tokenAttestationsRoutes: FastifyPluginAsync<Deps> = async (app, deps) => {
  const attestLimiter = new PostgresSlidingWindowLimiter(
    deps.pool,
    deps.config.ATTEST_RATE_LIMIT_PER_IP,
    deps.config.ATTEST_RATE_WINDOW_SEC,
  );
  const chainRegistry = buildAttestationChainRegistry(deps.config.attestAllowlistOverrides);

  app.post("/v1/tokens/attest", async (request, reply) => {
    const rateDecision = await attestLimiter.allow(
      rateLimitKeyHash("attest", request.ip, deps.config.RATE_LIMIT_KEY_SALT),
    );
    if (!rateDecision.ok) {
      return sendRateLimited(reply, rateDecision.retryAfterSec, "too many attest requests");
    }
    const parsed = attestRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, "validation_failed", "attest body failed validation");
    }
    // The pair, never the chain alone: chain 4663 hosts three launchpads and Base hosts one, so a
    // chain that is in the registry can still be the wrong place to claim a given launchpad.
    if (
      !attestationLaunchpadSupported(chainRegistry, {
        chainId: parsed.data.chainId,
        launchpad: parsed.data.launchpad,
      })
    ) {
      return sendError(
        reply,
        400,
        "chain_unsupported",
        "chain and launchpad are not in the attestation registry",
      );
    }
    const tokenAddress = parsed.data.tokenAddress.toLowerCase();
    const message = canonicalAttestMessage(parsed.data.chainId, tokenAddress);
    const recoveredSigner = await recoverAttestSigner(message, parsed.data.attestSignature as Hex);
    if (recoveredSigner === null) {
      return sendError(reply, 400, "invalid_signature", "signature does not recover to a valid address");
    }
    const submitterIpHash = rateLimitKeyHash("attest_submitter", request.ip, deps.config.RATE_LIMIT_KEY_SALT);
    const client = await deps.pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = await submitAttestation(
        client,
        {
          chainId: parsed.data.chainId,
          launchpad: parsed.data.launchpad,
          tokenAddress,
          recoveredSigner,
          attestSignature: parsed.data.attestSignature,
          txHashHint: parsed.data.txHash ?? null,
          submitterIpHash,
        },
        {
          maxPendingPerIp: deps.config.ATTEST_MAX_PENDING_PER_IP,
          maxPendingGlobal: deps.config.ATTEST_MAX_PENDING_GLOBAL,
        },
      );
      await client.query("COMMIT");
      if (outcome.kind !== "accepted") {
        return sendRateLimited(reply, deps.config.ATTEST_RATE_WINDOW_SEC, "too many pending attestations");
      }
      return { status: "accepted", verifyStatus: outcome.verifyStatus };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.options("/v1/tokens/:chainId/:address", async (_request, reply) => {
    reply
      .header("access-control-allow-origin", "*")
      .header("access-control-allow-methods", "GET, OPTIONS")
      .status(204)
      .send();
  });

  app.get<{ Params: { chainId: string; address: string } }>(
    "/v1/tokens/:chainId/:address",
    async (request, reply) => {
      reply.header("access-control-allow-origin", "*");
      const chainId = chainIdFromParam(request.params.chainId);
      const tokenAddress = tokenAddressFromParam(request.params.address);
      if (chainId === null || tokenAddress === null) {
        reply.header("cache-control", "no-store");
        return reply.status(404).send({ error: { code: "not_found", message: "token attestation not found" } });
      }
      const candidates = await attestationCandidatesFor(
        deps.pool,
        chainId,
        tokenAddress,
        deps.config.ATTEST_CANDIDATES_MAX,
      );
      const best = bestAttestationCandidate(candidates);
      if (best === null) {
        reply.header("cache-control", "no-store");
        return reply.status(404).send({ error: { code: "not_found", message: "token attestation not found" } });
      }
      const dto = attestationDto(chainId, tokenAddress, best);
      reply.header(
        "cache-control",
        dto.status === "verified" ? "public, max-age=300, must-revalidate" : "no-store",
      );
      return dto;
    },
  );
};
