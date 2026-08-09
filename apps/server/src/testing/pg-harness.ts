import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";

const MIGRATE_UP_MARKER = "-- migrate:up";
const MIGRATE_DOWN_MARKER = "-- migrate:down";

const migrationsDir = fileURLToPath(new URL("../../../../db/migrations", import.meta.url));

export function migrateUpSection(migrationSql: string): string {
  const afterUpMarker = migrationSql.slice(
    migrationSql.indexOf(MIGRATE_UP_MARKER) + MIGRATE_UP_MARKER.length,
  );
  const downMarkerIndex = afterUpMarker.indexOf(MIGRATE_DOWN_MARKER);
  return downMarkerIndex === -1 ? afterUpMarker : afterUpMarker.slice(0, downMarkerIndex);
}

function migrationUpSectionsInFilenameOrder(): string[] {
  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => migrateUpSection(readFileSync(join(migrationsDir, fileName), "utf8")));
}

export async function startTestDb(): Promise<{ pool: pg.Pool; stop(): Promise<void> }> {
  const container = await new PostgreSqlContainer("postgres:17").start();
  const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  for (const upSection of migrationUpSectionsInFilenameOrder()) {
    await pool.query(upSection);
  }
  return {
    pool,
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
