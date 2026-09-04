/**
 * THE METADATA OWNER for every asset this host serves. The bytes belong to
 * `AssetByteStore`; what an asset IS, WHO still publishes it and whether it
 * has been withdrawn belongs here.
 *
 * TWO TABLES, BECAUSE OWNERSHIP IS A SET. `launch_assets` is one row per cid -
 * the bytes' type, size, dimensions and tombstone. `launch_asset_publishers`
 * is one row per (cid, install): the claim that makes an install a publisher
 * of those bytes. Two installs can hold the same file and a content-addressed
 * store cannot hold a second copy, so the second uploader gets a claim rather
 * than a copy, deletes only its own claim, and the asset is tombstoned when
 * the last claim goes. `launch_assets.first_publisher_hash` decides nothing:
 * it records who introduced the bytes, for an operator, and is never read by
 * authorization or by the quota.
 *
 * TWO ADVISORY LOCKS, ALWAYS IN THIS ORDER: the install, then the cid. The
 * install lock serializes one install's uploads so two of them cannot both
 * observe the same "room left" in the quota and both take it. The cid lock
 * serializes everything touching one asset across installs, which is what
 * makes "first uploader inserts the asset row, everyone after that adds a
 * claim" a decision rather than a race. Taking them in one fixed order, and
 * never taking a second lock of either kind in one transaction, is what keeps
 * the pair deadlock-free. They live in separate lock classes so an install
 * hash and a cid can never collide into the same lock.
 */

import type pg from "pg";
import type { AssetContentType } from "./image-bytes.js";
import type { QuotaUsage } from "./quota.js";

/** Advisory lock classes. Distinct so the two key spaces cannot alias. */
const INSTALL_LOCK_CLASS = 1;
/**
 * Exported so the concurrency integration test can hold the SAME lock from its
 * own session and park two uploads of identical bytes on it deterministically.
 * Nothing outside this module and that test may take it.
 */
export const CONTENT_LOCK_CLASS = 2;

export type AssetRow = {
  readonly cid: string;
  /** Audit only: who published these bytes first. Authorization reads publishers, not this. */
  readonly firstPublisherHash: string;
  readonly contentType: AssetContentType;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
};

type AssetDbRow = {
  cid: string;
  first_publisher_hash: string;
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
    firstPublisherHash: row.first_publisher_hash,
    contentType: row.content_type,
    byteLength: Number(row.byte_length),
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

const SELECT_COLUMNS =
  "cid, first_publisher_hash, content_type, byte_length, width, height, created_at, deleted_at";

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

/**
 * What this install currently publishes: its claims on assets that are not
 * tombstoned. A withdrawn claim frees quota immediately, and a tombstoned
 * asset frees it for everyone, because in both cases the install is no longer
 * keeping those bytes on the volume.
 */
export async function liveUsageFor(
  queryable: pg.Pool | pg.PoolClient,
  agentHash: string,
): Promise<QuotaUsage> {
  const result = await queryable.query<{ asset_count: string; byte_total: string }>(
    `SELECT count(*)::text AS asset_count, coalesce(sum(a.byte_length), 0)::text AS byte_total
       FROM launch_asset_publishers p
       JOIN launch_assets a ON a.cid = p.cid
      WHERE p.agent_hash = $1 AND a.deleted_at IS NULL`,
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
 * space is 32 bits within its class and a collision between two installs costs
 * a little contention, never correctness.
 */
export async function lockInstallUploads(client: pg.PoolClient, agentHash: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [INSTALL_LOCK_CLASS, agentHash]);
}

/**
 * Serialize everything that touches one cid - uploads by any install, and the
 * withdrawal that may tombstone it - for the rest of the transaction. ALWAYS
 * taken after `lockInstallUploads` when both are needed.
 */
export async function lockContentId(client: pg.PoolClient, cid: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [CONTENT_LOCK_CLASS, cid]);
}

export type InsertAssetInput = {
  readonly cid: string;
  readonly firstPublisherHash: string;
  readonly contentType: AssetContentType;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Insert the asset row. Plain, with no conflict clause on purpose: the caller
 * holds this cid's advisory lock and has just read that no row exists, so a
 * unique violation here would mean the lock discipline is broken and must be
 * seen as the 500 it is, not swallowed.
 */
export async function insertAssetRow(client: pg.PoolClient, input: InsertAssetInput): Promise<void> {
  await client.query(
    `INSERT INTO launch_assets (cid, first_publisher_hash, content_type, byte_length, width, height)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.cid,
      input.firstPublisherHash,
      input.contentType,
      input.byteLength,
      input.width,
      input.height,
    ],
  );
}

export async function isPublisher(
  client: pg.PoolClient,
  cid: string,
  agentHash: string,
): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM launch_asset_publishers WHERE cid = $1 AND agent_hash = $2",
    [cid, agentHash],
  );
  return result.rowCount === 1;
}

/** Record this install's claim on the bytes. */
export async function insertPublisher(
  client: pg.PoolClient,
  cid: string,
  agentHash: string,
): Promise<void> {
  await client.query(
    "INSERT INTO launch_asset_publishers (cid, agent_hash) VALUES ($1, $2)",
    [cid, agentHash],
  );
}

/** `false` means this install was not a publisher, which the caller answers 403. */
export async function deletePublisher(
  client: pg.PoolClient,
  cid: string,
  agentHash: string,
): Promise<boolean> {
  const result = await client.query(
    "DELETE FROM launch_asset_publishers WHERE cid = $1 AND agent_hash = $2",
    [cid, agentHash],
  );
  return result.rowCount === 1;
}

export async function publisherCountFor(client: pg.PoolClient, cid: string): Promise<number> {
  const result = await client.query<{ publishers: string }>(
    "SELECT count(*)::text AS publishers FROM launch_asset_publishers WHERE cid = $1",
    [cid],
  );
  return Number(result.rows[0]?.publishers ?? 0);
}

/**
 * Tombstone the asset. Called only when the LAST claim has just gone, so it
 * carries no owner predicate: by then nobody publishes these bytes and the
 * withdrawal belongs to the asset, not to an install.
 *
 * Idempotent: an already-tombstoned asset keeps its ORIGINAL `deleted_at`,
 * because the first withdrawal is the fact worth auditing.
 */
export async function markAssetDeleted(client: pg.PoolClient, cid: string): Promise<boolean> {
  const result = await client.query(
    "UPDATE launch_assets SET deleted_at = now() WHERE cid = $1 AND deleted_at IS NULL",
    [cid],
  );
  return result.rowCount === 1;
}
