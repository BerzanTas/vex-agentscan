import type pg from "pg";
import type { Logger } from "pino";

export async function beatHeartbeat(pool: pg.Pool, workerName: string): Promise<void> {
  await pool.query(
    `INSERT INTO worker_heartbeat (worker_name, beat_at) VALUES ($1, now())
     ON CONFLICT (worker_name) DO UPDATE SET beat_at = now()`,
    [workerName],
  );
}

export function startHeartbeat(args: {
  pool: pg.Pool;
  workerName: string;
  intervalSec: number;
  logger: Logger;
}): () => void {
  const beat = async (): Promise<void> => {
    try {
      await beatHeartbeat(args.pool, args.workerName);
    } catch (error) {
      args.logger.error({ err: error }, "heartbeat failed");
    }
  };
  const timer = setInterval(() => void beat(), args.intervalSec * 1000);
  void beat();
  return () => clearInterval(timer);
}
