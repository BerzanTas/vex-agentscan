import { fileURLToPath } from "node:url";
import autoload from "@fastify/autoload";
import { fastify, type FastifyInstance } from "fastify";
import type pg from "pg";
import type { Config } from "./config.js";
import { errorEnvelope } from "./plugins/error-envelope.js";

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
  });
  await app.register(errorEnvelope);
  await app.register(autoload, {
    dir: fileURLToPath(new URL("routes", import.meta.url)),
    dirNameRoutePrefix: false,
    options: deps,
  });
  return app;
}
