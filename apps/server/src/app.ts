import { fastify, type FastifyInstance } from "fastify";
import type pg from "pg";
import type { Config } from "./config.js";
import { errorEnvelope } from "./plugins/error-envelope.js";
import { securityHeaders } from "./plugins/security-headers.js";
import { routePlugins } from "./routes/index.js";

export type ChainEntry = {
  canonicalSlug: string;
  displayName: string;
  explorerTxUrl: (txHash: string) => string | null;
  rpcUrls: string[];
  verificationTier: "full" | "basic";
};

export type ResolveChain = (key: {
  protocol: string;
  chainFamily: "eip155" | "solana";
  chainId: bigint;
}) => ChainEntry | null;

export type Deps = { pool: pg.Pool; config: Config; resolveChain: ResolveChain };

export async function buildApp(deps: Deps): Promise<FastifyInstance> {
  const app = fastify({
    logger: { redact: { paths: ["req.headers.authorization"], censor: "[redacted]" } },
    bodyLimit: deps.config.MAX_BODY_BYTES,
    trustProxy: deps.config.TRUST_PROXY ?? false,
  });
  await app.register(securityHeaders);
  await app.register(errorEnvelope, {
    poolTimeoutRetryAfterSec: deps.config.POOL_TIMEOUT_RETRY_AFTER_SEC,
  });
  for (const plugin of routePlugins) await app.register(plugin, deps);
  return app;
}
