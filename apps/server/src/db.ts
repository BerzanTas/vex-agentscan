import pg from "pg";

export type PoolTuning = {
  max: number;
  connectionTimeoutMillis: number;
};

export function createPool(databaseUrl: string, tuning: PoolTuning): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: tuning.max,
    connectionTimeoutMillis: tuning.connectionTimeoutMillis,
  });
}
