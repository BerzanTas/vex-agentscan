import { z } from "zod";

const RPC_URLS_PREFIX = "RPC_URLS_";
const ATTEST_FACTORY_ADDRESSES_PREFIX = "ATTEST_FACTORY_ADDRESSES_";
const DEFAULT_AGENT_ALIAS_SALT = "agentscan-dev-salt";
const DEFAULT_RATE_LIMIT_KEY_SALT = "agentscan-dev-rate-salt";
const DEFAULT_HANDSHAKE_DOMAIN = "localhost";
const DEFAULT_WALLET_HMAC_PEPPER = "agentscan-dev-wallet-hmac-pepper";

const commaSeparated = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
  DATABASE_POOL_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().min(1).default(5000),
  POOL_TIMEOUT_RETRY_AFTER_SEC: z.coerce.number().int().min(1).default(5),
  PORT: z.coerce.number().int().default(3000),
  TRUST_PROXY: z.string().optional(),
  INGEST_RATE_LIMIT_PER_TOKEN: z.coerce.number().int().default(60),
  INGEST_RATE_WINDOW_SEC: z.coerce.number().int().default(60),
  REGISTER_RATE_LIMIT_PER_IP: z.coerce.number().int().default(10),
  REGISTER_RATE_WINDOW_SEC: z.coerce.number().int().default(3600),
  MAX_BATCH_EVENTS: z.coerce.number().int().default(500),
  MAX_BODY_BYTES: z.coerce.number().int().default(1048576),
  QUARANTINE_STRIKES: z.coerce.number().int().default(3),
  VERIFY_TIME_TOLERANCE_MIN: z.coerce.number().int().default(10),
  VERIFY_AMOUNT_TOLERANCE_PCT: z.coerce.number().default(0.5),
  VERIFY_CORROBORATING_ENDPOINTS: z.coerce.number().int().min(1).default(2),
  VERIFY_BACKOFF_SCHEDULE: z.string().default("1m,5m,30m,2h,12h").transform(commaSeparated),
  VERIFY_MAX_AGE_DAYS: z.coerce.number().int().default(7),
  VERIFY_FAKE_MODE: z.enum(["off", "confirm_all"]).default("off"),
  SOLANA_RPC_TIMEOUT_MS: z.coerce.number().int().min(1).default(10000),
  UNKNOWN_CHAIN_BACKOFF_MIN: z.coerce.number().int().default(360),
  WORKER_POLL_INTERVAL_SEC: z.coerce.number().int().default(15),
  WORKER_BATCH: z.coerce.number().int().default(20),
  WORKER_LEASE_SEC: z.coerce.number().int().min(1).default(120),
  WORKER_RPC_CONCURRENCY: z.coerce.number().int().min(1).default(10),
  WORKER_HEARTBEAT_MAX_AGE_SEC: z.coerce.number().int().default(120),
  PURGE_DELAY_H: z.coerce.number().int().default(24),
  PURGE_INTERVAL_MIN: z.coerce.number().int().default(60),
  PURGE_IN_WORKER: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  PUBLIC_FEED_PAGE_SIZE: z.coerce.number().int().default(25),
  PUBLIC_TOKEN_ROWS_MAX: z.coerce.number().int().min(1).default(100),
  PUBLIC_AGENT_ROWS_MAX: z.coerce.number().int().min(1).default(5000),
  PUBLIC_PANEL_ROWS: z.coerce.number().int().min(1).default(10),
  READ_CACHE_TTL_SEC: z.coerce.number().int().min(0).default(5),
  AGENT_ALIAS_SALT: z.string().min(1).default(DEFAULT_AGENT_ALIAS_SALT),
  RATE_LIMIT_KEY_SALT: z.string().min(1).default(DEFAULT_RATE_LIMIT_KEY_SALT),
  ATTEST_RATE_LIMIT_PER_IP: z.coerce.number().int().default(20),
  ATTEST_RATE_WINDOW_SEC: z.coerce.number().int().default(3600),
  ATTEST_MAX_PENDING_PER_IP: z.coerce.number().int().default(100),
  ATTEST_MAX_PENDING_GLOBAL: z.coerce.number().int().default(10000),
  ATTEST_CANDIDATES_MAX: z.coerce.number().int().min(1).default(50),
  ATTEST_MIN_CONFIRMATIONS: z.coerce.number().int().min(0).default(5),
  ATTEST_MAX_AGE_DAYS: z.coerce.number().int().default(14),
  ATTEST_WORKER_BATCH: z.coerce.number().int().default(20),
  ATTEST_WORKER_LEASE_SEC: z.coerce.number().int().min(1).default(120),
  ATTEST_BACKOFF_SCHEDULE: z.string().default("1m,5m,30m,2h,12h").transform(commaSeparated),
  HANDSHAKE_RATE_LIMIT_PER_IP: z.coerce.number().int().default(10),
  HANDSHAKE_RATE_WINDOW_SEC: z.coerce.number().int().default(3600),
  HANDSHAKE_DOMAIN: z.string().min(1).regex(/^[a-z0-9.:-]+$/i).default(DEFAULT_HANDSHAKE_DOMAIN),
  HANDSHAKE_CHALLENGE_TTL_MIN: z.coerce.number().int().min(1).default(5),
  WALLET_HMAC_PEPPER: z.string().min(32).default(DEFAULT_WALLET_HMAC_PEPPER),
  PRICE_FEED_BASE_URL: z.string().url().default("https://coins.llama.fi"),
  PRICE_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.9),
  PRICE_MAX_DRIFT_SEC: z.coerce.number().int().min(1).default(3600),
  PRICE_MISS_RETRY_HOURS: z.coerce.number().int().min(1).default(24),
  PRICE_FEED_COINS_PER_REQUEST: z.coerce.number().int().min(1).default(50),
  PRICE_FEED_TIMEOUT_MS: z.coerce.number().int().min(1).default(10_000),
  PRICE_DIVERGENCE_WARN_RATIO: z.coerce.number().min(1).default(5),
  PRICING_BATCH_MAX: z.coerce.number().int().min(1).default(50),
  PRICING_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(6),
  PRICING_POLL_INTERVAL_SEC: z.coerce.number().int().min(1).default(30),
  PRICING_LEASE_SEC: z.coerce.number().int().min(1).default(600),
  PRICING_BACKOFF_SCHEDULE: z.string().default("1m,5m,30m,2h,12h").transform(commaSeparated),
  WIN_RATE_MIN_ROUND_TRIPS: z.coerce.number().int().min(1).default(5),
});

export type Config = z.infer<typeof envSchema> & {
  rpcUrlOverrides: Map<string, string[]>;
  attestFactoryAddressesByChainId: Map<bigint, string[]>;
};

function rpcUrlOverridesFrom(env: NodeJS.ProcessEnv): Map<string, string[]> {
  const overrides = new Map<string, string[]>();
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(RPC_URLS_PREFIX) || !value) continue;
    overrides.set(key.slice(RPC_URLS_PREFIX.length).toLowerCase(), commaSeparated(value));
  }
  return overrides;
}

function attestFactoryAddressesByChainIdFrom(env: NodeJS.ProcessEnv): Map<bigint, string[]> {
  const byChainId = new Map<bigint, string[]>();
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(ATTEST_FACTORY_ADDRESSES_PREFIX) || !value) continue;
    byChainId.set(BigInt(key.slice(ATTEST_FACTORY_ADDRESSES_PREFIX.length)), commaSeparated(value));
  }
  return byChainId;
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
  if (parsed.HANDSHAKE_DOMAIN === DEFAULT_HANDSHAKE_DOMAIN && env.NODE_ENV === "production") {
    throw new Error("HANDSHAKE_DOMAIN must be set to the real domain when NODE_ENV=production");
  }
  if (parsed.WALLET_HMAC_PEPPER === DEFAULT_WALLET_HMAC_PEPPER && env.NODE_ENV === "production") {
    throw new Error("WALLET_HMAC_PEPPER must be set to a random value when NODE_ENV=production");
  }
  return {
    ...parsed,
    rpcUrlOverrides: rpcUrlOverridesFrom(env),
    attestFactoryAddressesByChainId: attestFactoryAddressesByChainIdFrom(env),
  };
}
