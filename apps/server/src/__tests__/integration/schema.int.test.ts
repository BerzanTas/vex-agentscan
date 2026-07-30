import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { startTestDb } from "../../testing/pg-harness.js";

const AGENT_HASH = "a".repeat(64);

let db: { pool: pg.Pool; stop(): Promise<void> };

beforeAll(async () => {
  db = await startTestDb();
  await db.pool.query(
    "INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at) VALUES ($1, $2, 1, now())",
    [AGENT_HASH, "b".repeat(64)],
  );
});

afterAll(async () => {
  await db.stop();
});

function insertActivity(args: { sourceRowId: string; publicId: string; status: string }) {
  return db.pool.query(
    `INSERT INTO activities
       (agent_hash, source_row_id, public_id, source_execution_id, event_index,
        kind, event_role, status, protocol, chain_family, chain_id,
        client_created_at, statuses_seen, received_schema_version)
     VALUES ($1, $2, $3, '9021', 0, 'swap', 'swap', $4, 'kyberswap', 'eip155', 8453,
             now(), $5, 1)`,
    [AGENT_HASH, args.sourceRowId, args.publicId, args.status, [args.status]],
  );
}

describe("baseline schema", () => {
  it("accepts an agent row and a referencing activity row", async () => {
    const inserted = await insertActivity({
      sourceRowId: "44210",
      publicId: "f".repeat(32),
      status: "confirmed",
    });
    expect(inserted.rowCount).toBe(1);
  });

  it("rejects an activity with status outside the allowed set with a check violation", async () => {
    await expect(
      insertActivity({ sourceRowId: "44211", publicId: "e".repeat(32), status: "invalid" }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects a second activity with the same agent_hash and source_row_id with a unique violation", async () => {
    await insertActivity({ sourceRowId: "44212", publicId: "d".repeat(32), status: "pending" });
    await expect(
      insertActivity({ sourceRowId: "44212", publicId: "c".repeat(32), status: "pending" }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
