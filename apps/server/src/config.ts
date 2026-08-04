import { z } from "zod";

const RPC_URLS_PREFIX = "RPC_URLS_";
const DEFAULT_AGENT_ALIAS_SALT = "agentscan-dev-salt";
const DEFAULT_RATE_LIMIT_KEY_SALT = "agentscan-dev-rate-salt";

const commaSeparated = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),
  DATABASE_POOL_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().default(5000),
  PORT: z.coerce.number().int().default(3000),
  INGEST_RATE_LIMIT_PER_TOKEN: z.coerce.number().int().default(60),
  INGEST_RATE_WINDOW_SEC: z.coerce.number().int().default(60),
  REGISTER_RATE_LIMIT_PER_IP: z.coerce.number().int().default(10),
  REGISTER_RATE_WINDOW_SEC: z.coerce.number().int().default(3600),
  MAX_BATCH_EVENTS: z.coerce.number().int().default(500),
  MAX_BODY_BYTES: z.coerce.number().int().default(1048576),
  QUARANTINE_STRIKES: z.coerce.number().int().default(3),
  VERIFY_TIME_TOLERANCE_MIN: z.coerce.number().int().default(10),
  VERIFY_AMOUNT_TOLERANCE_PCT: z.coerce.number().default(0.5),
  VERIFY_BACKOFF_SCHEDULE: z.string().default("1m,5m,30m,2h,12h").transform(commaSeparated),
  VERIFY_MAX_AGE_DAYS: z.coerce.number().int().default(7),
  VERIFY_FAKE_MODE: z.enum(["off", "confirm_all"]).default("off"),
  UNKNOWN_CHAIN_BACKOFF_MIN: z.coerce.number().int().default(360),
  WORKER_POLL_INTERVAL_SEC: z.coerce.number().int().default(15),
  WORKER_BATCH: z.coerce.number().int().default(20),
  WORKER_LEASE_SEC: z.coerce.number().int().min(1).default(120),
  WORKER_RPC_CONCURRENCY: z.coerce.number().int().min(1).default(10),
  WORKER_HEARTBEAT_MAX_AGE_SEC: z.coerce.number().int().default(120),
  PURGE_DELAY_H: z.coerce.number().int().default(24),
  PURGE_INTERVAL_MIN: z.coerce.number().int().default(60),
  PUBLIC_FEED_PAGE_SIZE: z.coerce.number().int().default(25),
  AGENT_ALIAS_SALT: z.string().min(1).default(DEFAULT_AGENT_ALIAS_SALT),
  RATE_LIMIT_KEY_SALT: z.string().min(1).default(DEFAULT_RATE_LIMIT_KEY_SALT),
});

export type Config = z.infer<typeof envSchema> & { rpcUrlOverrides: Map<string, string[]> };

function rpcUrlOverridesFrom(env: NodeJS.ProcessEnv): Map<string, string[]> {
  const overrides = new Map<string, string[]>();
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(RPC_URLS_PREFIX) || !value) continue;
    overrides.set(key.slice(RPC_URLS_PREFIX.length).toLowerCase(), commaSeparated(value));
  }
  return overrides;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.parse(env);
  if (parsed.VERIFY_FAKE_MODE === "confirm_all" && env.NODE_ENV === "production") {
    throw new Error("VERIFY_FAKE_MODE=confirm_all is forbidden when NODE_ENV=production");
  }
  if (parsed.AGENT_ALIAS_SALT === DEFAULT_AGENT_ALIAS_SALT && env.NODE_ENV === "production") {
    throw new Error("AGENT_ALIAS_SALT must be set to a random value when NODE_ENV=production");
  }
  if (parsed.RATE_LIMIT_KEY_SALT === DEFAULT_RATE_LIMIT_KEY_SALT && env.NODE_ENV === "production") {
    throw new Error("RATE_LIMIT_KEY_SALT must be set to a random value when NODE_ENV=production");
  }
  return { ...parsed, rpcUrlOverrides: rpcUrlOverridesFrom(env) };
}
