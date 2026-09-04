/**
 * The launch-assets host's OWN configuration. It shares a database with the
 * AgentScan API (the `agents` table is where an install's credential lives)
 * and nothing else: its bytes, its bounds and its public base are its own, so
 * they are parsed here rather than borrowed from `apps/server/src/config.ts`.
 * Every deployment-varying value is an env key; the protocol constants (the
 * accepted image types, the dimension band) are not configuration and live in
 * `image-bytes.ts`.
 */

import { z } from "zod";

const DEFAULT_PUBLIC_BASE = "http://localhost:3000";

/** 2 MiB. Enough for real token art at retina sizes, small enough to bound one request. */
const DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
  DATABASE_POOL_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().min(1).default(5000),
  POOL_TIMEOUT_RETRY_AFTER_SEC: z.coerce.number().int().min(1).default(5),
  PORT: z.coerce.number().int().default(3000),
  TRUST_PROXY: z.string().optional(),
  /** The directory this service owns outright. In production it is a mounted volume. */
  ASSETS_DIR: z.string().min(1),
  /**
   * The origin (and optional path prefix) every minted URL is built from, WITHOUT a
   * trailing slash. It is part of the URL a user approves and a token carries on
   * chain, so it is refused rather than guessed when it is left at the dev default
   * in production.
   */
  ASSETS_PUBLIC_BASE: z
    .string()
    .url()
    .refine((value) => !value.endsWith("/"), { message: "must not end with a slash" })
    .default(DEFAULT_PUBLIC_BASE),
  ASSETS_MAX_UPLOAD_BYTES: z.coerce.number().int().min(1).default(DEFAULT_MAX_UPLOAD_BYTES),
  ASSETS_MAX_PER_INSTALL: z.coerce.number().int().min(1).default(100),
  ASSETS_MAX_BYTES_PER_INSTALL: z.coerce.number().int().min(1).default(64 * 1024 * 1024),
});

export type AssetsConfig = z.infer<typeof envSchema>;

export function loadAssetsConfig(env: NodeJS.ProcessEnv): AssetsConfig {
  const parsed = envSchema.parse(env);
  if (env.NODE_ENV === "production") {
    if (parsed.ASSETS_PUBLIC_BASE === DEFAULT_PUBLIC_BASE) {
      throw new Error("ASSETS_PUBLIC_BASE must be the real public base when NODE_ENV=production");
    }
    if (!parsed.ASSETS_PUBLIC_BASE.startsWith("https://")) {
      throw new Error("ASSETS_PUBLIC_BASE must be https when NODE_ENV=production");
    }
  }
  return parsed;
}
