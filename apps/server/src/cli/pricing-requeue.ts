import type pg from "pg";

export async function requeueUnpricedActivities(
  pool: pg.Pool,
  chainId?: bigint,
): Promise<{ requeuedCount: number }> {
  const chainScope = chainId === undefined
    ? { predicate: "", params: [] }
    : { predicate: " AND chain_id = $1", params: [chainId.toString()] };
  const result = await pool.query(
    `UPDATE activities
     SET pricing_state = 'pending', pricing_attempts = 0, pricing_next_attempt_at = now()
     WHERE pricing_state = 'unpriced'${chainScope.predicate}`,
    chainScope.params,
  );
  return { requeuedCount: result.rowCount ?? 0 };
}
