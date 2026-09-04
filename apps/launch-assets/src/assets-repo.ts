/**
 * THE `launch_assets` ROW - the metadata owner for every asset this host
 * serves. The bytes belong to `AssetByteStore`; what an asset IS, who
 * published it and whether it has been withdrawn belongs here.
 *
 * SERIALIZED PER INSTALL. `beginUploadForInstall` takes a transaction-scoped
 * advisory lock keyed on the install before it reads the quota, so two
 * concurrent uploads from one install cannot both observe the same "room left"
 * and both take it. Different installs never contend: their keys differ, and
 * their quotas are independent.
 */

import type pg from "pg";
import type { AssetContentType } from "./image-bytes.js";
import type { QuotaUsage } from "./quota.js";

export type AssetRow = {
  readonly cid: string;
  readonly agentHash: string;
  readonly contentType: AssetContentType;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
};

type AssetDbRow = {
  cid: string;
  agent_hash: string;
  content_type: AssetContentType;
  byte_length: string;
  width: number;
  height: number;
  created_at: Date;
  deleted_at: Date | null;
};

/** `byte_length` arrives as text because it is a BIGINT; the cap keeps it inside Number range. */
function assetRowFrom(row: AssetDbRow): AssetRow {
  return {
    cid: row.cid,
    agentHash: row.agent_hash,
    contentType: row.content_type,
    byteLength: Number(row.byte_length),
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

const SELECT_COLUMNS =
  "cid, agent_hash, content_type, byte_length, width, height, created_at, deleted_at";

export async function assetRowFor(
  queryable: pg.Pool | pg.PoolClient,
  cid: string,
): Promise<AssetRow | null> {
  const result = await queryable.query<AssetDbRow>(
    `SELECT ${SELECT_COLUMNS} FROM launch_assets WHERE cid = $1`,
    [cid],
  );
  const row = result.rows[0];
  return row ? assetRowFrom(row) : null;
}

/** Live usage only: a deleted asset's bytes are gone, so they do not count. */
export async function liveUsageFor(
  queryable: pg.Pool | pg.PoolClient,
  agentHash: string,
): Promise<QuotaUsage> {
  const result = await queryable.query<{ asset_count: string; byte_total: string }>(
    `SELECT count(*)::text AS asset_count, coalesce(sum(byte_length), 0)::text AS byte_total
       FROM launch_assets
      WHERE agent_hash = $1 AND deleted_at IS NULL`,
    [agentHash],
  );
  const row = result.rows[0];
  return {
    assetCount: Number(row?.asset_count ?? 0),
    byteTotal: Number(row?.byte_total ?? 0),
  };
}

/**
 * Serialize this install's uploads for the rest of the transaction. The key is
 * derived with `hashtext` rather than by parsing the hash, because the lock
 * space is 64 bits of advisory namespace and a collision between two installs
 * costs a little contention, never correctness.
 */
export async function lockInstallUploads(client: pg.PoolClient, agentHash: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [agentHash]);
}

export type InsertAssetInput = {
  readonly cid: string;
  readonly agentHash: string;
  readonly contentType: AssetContentType;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
};

/**
 * `"taken"` means another install published this exact cid between our read
 * and our write. It is a normal outcome of a content-addressed store, not an
 * error: the caller re-reads the row and answers from it.
 */
export async function insertAssetRow(
  client: pg.PoolClient,
  input: InsertAssetInput,
): Promise<"inserted" | "taken"> {
  const result = await client.query(
    `INSERT INTO launch_assets (cid, agent_hash, content_type, byte_length, width, height)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (cid) DO NOTHING`,
    [
      input.cid,
      input.agentHash,
      input.contentType,
      input.byteLength,
      input.width,
      input.height,
    ],
  );
  return result.rowCount === 1 ? "inserted" : "taken";
}

/**
 * Tombstone the row. Scoped to the owner in the statement itself so a
 * concurrent ownership read cannot let a foreign delete through; `false` means
 * nothing matched, and the caller distinguishes "no such asset" from "not
 * yours" by reading the row first.
 *
 * Idempotent: deleting an already-deleted asset keeps the ORIGINAL
 * `deleted_at`, because the first withdrawal is the fact worth auditing.
 */
export async function markAssetDeleted(
  pool: pg.Pool,
  cid: string,
  agentHash: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE launch_assets SET deleted_at = now()
      WHERE cid = $1 AND agent_hash = $2 AND deleted_at IS NULL`,
    [cid, agentHash],
  );
  return result.rowCount === 1;
}
