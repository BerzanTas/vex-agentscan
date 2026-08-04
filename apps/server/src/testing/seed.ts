import type pg from "pg";

export async function seedAgent(pool: pg.Pool, agentHash: string): Promise<void> {
  await pool.query(
    `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, first_verified_at)
     VALUES ($1, $2, 1, now(), now())
     ON CONFLICT (agent_hash) DO NOTHING`,
    [agentHash, `token-${agentHash}`],
  );
}

export type SeedActivityOptions = {
  agentHash?: string;
  publicId: string;
  verificationState?: "none" | "queued" | "verified_full" | "verified_basic" | "mismatch";
  eventRole?: "swap" | "bridge_deposit";
  usdInEst?: string;
  confirmedDaysAgo?: number;
};

export async function seedActivity(pool: pg.Pool, options: SeedActivityOptions): Promise<bigint> {
  const agentHash = options.agentHash ?? "a".repeat(64);
  await seedAgent(pool, agentHash);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO activities (
       agent_hash, source_row_id, public_id, source_execution_id, event_index,
       kind, event_role, status, protocol, chain_family, chain_id,
       tx_hash, usd_in_est, client_created_at, client_confirmed_at,
       statuses_seen, verification_state, received_schema_version
     ) VALUES (
       $1, $2, $2, $2, 0,
       'swap', $3, 'confirmed', 'kyberswap', 'eip155', 8453,
       '0x' || repeat('a', 64), $4::numeric, now(), now() - make_interval(days => $5::int),
       ARRAY['confirmed'], $6, 1
     )
     RETURNING id`,
    [
      agentHash,
      options.publicId,
      options.eventRole ?? "swap",
      options.usdInEst ?? "0",
      options.confirmedDaysAgo ?? 0,
      options.verificationState ?? "queued",
    ],
  );
  return BigInt(result.rows[0]!.id);
}

export async function seedQueuedJob(pool: pg.Pool, publicId: string): Promise<bigint> {
  const activityId = await seedActivity(pool, { publicId, verificationState: "queued" });
  await pool.query(
    "INSERT INTO verification_jobs (activity_id, next_attempt_at) VALUES ($1, now())",
    [activityId.toString()],
  );
  return activityId;
}
