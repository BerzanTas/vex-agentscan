/**
 * THE ASSET HOST END TO END, against a real Postgres and a real directory.
 *
 * What only this level can prove, and therefore what it is here for:
 *  - the bytes a reader receives HASH BACK to the cid in the URL. That is the
 *    on-chain promise, and no unit test of the digest can establish it: it has
 *    to survive the request body, a file, a stream and the response;
 *  - the install credential is the ingest credential - the same `agents` row,
 *    with no second table and no second token;
 *  - reporting status does NOT gate this host (coordinator decision I1);
 *  - a deleted cid is 404 forever and cannot be republished BY ANYONE, which
 *    is a rule about two installs and one durable row;
 *  - OWNERSHIP IS A SET: two installs publishing identical bytes hold one
 *    asset and two claims, each withdraws only its own, and only the last
 *    withdrawal tombstones the cid and unlinks the file. That is a rule about
 *    two installs, two tables and a file, so nothing below this level can
 *    prove it;
 *  - two installs uploading identical bytes CONCURRENTLY still produce one
 *    asset row and two claims, which is a claim about a lock and can only be
 *    made against a real Postgres;
 *  - the quota refuses by the name of the axis it hit.
 */

import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { startTestDb } from "@agentscan/server/src/testing/pg-harness.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAssetsApp } from "../../app.js";
import { AssetByteStore } from "../../byte-store.js";
import { loadAssetsConfig } from "../../config.js";
import { assetRowFor, CONTENT_LOCK_CLASS } from "../../assets-repo.js";
import { gifFixture, jpegFixture, padTo, pngFixture } from "../image-fixtures.js";

const PUBLIC_BASE = "https://assets.test.example";
const MAX_UPLOAD_BYTES = 4096;

const OWNER_HASH = "a".repeat(64);
const STRANGER_HASH = "b".repeat(64);
const REVOKED_HASH = "c".repeat(64);
const QUARANTINED_HASH = "d".repeat(64);
const CRAMPED_HASH = "e".repeat(64);
const CLAIMER_HASH = "f".repeat(64);

const OWNER_TOKEN = "A".repeat(43);
const STRANGER_TOKEN = "B".repeat(43);
const REVOKED_TOKEN = "C".repeat(43);
const QUARANTINED_TOKEN = "D".repeat(43);
const CRAMPED_TOKEN = "E".repeat(43);
const CLAIMER_TOKEN = "F".repeat(43);

const sha256hex = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Every publisher row for a cid, oldest first. The ownership set, read raw. */
async function publishersOf(cid: string): Promise<string[]> {
  const result = await db.pool.query<{ agent_hash: string }>(
    "SELECT agent_hash FROM launch_asset_publishers WHERE cid = $1 ORDER BY created_at, agent_hash",
    [cid],
  );
  return result.rows.map((row) => row.agent_hash);
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let assetsDir: string;
let app: FastifyInstance;
let crampedApp: FastifyInstance;

/**
 * THE BODY IS THE IMAGE. `declaredType` defaults to the type the Vex engine
 * sends - `application/octet-stream` - precisely because the host must not
 * read it: the tests that care about the declared type pass one that is wrong
 * on purpose.
 */
const upload = (
  instance: FastifyInstance,
  token: string | null,
  bytes: Uint8Array,
  declaredType = "application/octet-stream",
) =>
  instance.inject({
    method: "PUT",
    url: "/v1/assets",
    payload: Buffer.from(bytes),
    headers: { "content-type": declaredType, ...(token ? auth(token) : {}) },
  });

const withdraw = (instance: FastifyInstance, token: string, cid: string) =>
  instance.inject({ method: "DELETE", url: `/v1/assets/${cid}`, headers: auth(token) });

beforeAll(async () => {
  db = await startTestDb();
  assetsDir = await mkdtemp(path.join(tmpdir(), "launch-assets-int-"));
  for (const [agentHash, token, status] of [
    [OWNER_HASH, OWNER_TOKEN, "active"],
    [STRANGER_HASH, STRANGER_TOKEN, "active"],
    [REVOKED_HASH, REVOKED_TOKEN, "revoked"],
    [QUARANTINED_HASH, QUARANTINED_TOKEN, "quarantined"],
    [CRAMPED_HASH, CRAMPED_TOKEN, "active"],
    [CLAIMER_HASH, CLAIMER_TOKEN, "active"],
  ] as const) {
    await db.pool.query(
      `INSERT INTO agents (agent_hash, ingest_token_sha256, consent_version, accepted_at, status)
       VALUES ($1, $2, 1, now(), $3)`,
      [agentHash, sha256hex(token), status],
    );
  }
  const baseEnv = {
    DATABASE_URL: "unused-by-the-app-under-test",
    ASSETS_DIR: assetsDir,
    ASSETS_PUBLIC_BASE: PUBLIC_BASE,
    ASSETS_MAX_UPLOAD_BYTES: String(MAX_UPLOAD_BYTES),
  };
  const store = new AssetByteStore(assetsDir);
  app = await buildAssetsApp({ pool: db.pool, config: loadAssetsConfig(baseEnv), store });
  crampedApp = await buildAssetsApp({
    pool: db.pool,
    store,
    // A second instance over the SAME database and store, differing only in its
    // bounds: the quota is a property of the configuration, not of the data.
    config: loadAssetsConfig({
      ...baseEnv,
      ASSETS_MAX_PER_INSTALL: "1",
      ASSETS_MAX_BYTES_PER_INSTALL: "200",
    }),
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await crampedApp?.close();
  await rm(assetsDir, { recursive: true, force: true });
  await db?.stop();
});

describe("PUT /v1/assets - who may write", () => {
  it("refuses an unauthenticated upload with a correlated envelope", async () => {
    const response = await upload(app, null, pngFixture(10, 10));
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(response.json().error.correlationId).toEqual(expect.any(String));
    expect(response.headers["x-correlation-id"]).toBe(response.json().error.correlationId);
  });

  it("refuses a token no install holds", async () => {
    const response = await upload(app, "Z".repeat(43), pngFixture(10, 10));
    expect(response.statusCode).toBe(401);
  });

  it.each([
    ["revoked", REVOKED_TOKEN, 21],
    ["quarantined", QUARANTINED_TOKEN, 23],
  ] as const)(
    "accepts an upload from a %s install, because reporting status is not this host's policy",
    async (_status, token, width) => {
      // Decision I1: no coupling to reporting consent. Withdrawing consent to
      // activity reporting must not silently remove the ability to launch a
      // token with a picture, and an ingest strike is not a statement about art.
      // Distinct bytes per case: identical bytes would be answered idempotently
      // and prove nothing about the second install.
      const response = await upload(app, token, pngFixture(width, 22));
      expect(response.statusCode).toBe(201);
    },
  );
});

describe("PUT /v1/assets - what it stores", () => {
  it("returns the content address, the URL and the measured facts", async () => {
    const bytes = pngFixture(320, 200);
    const response = await upload(app, OWNER_TOKEN, bytes);
    expect(response.statusCode).toBe(201);
    const cid = sha256hex(bytes);
    expect(response.json()).toEqual({
      cid,
      url: `${PUBLIC_BASE}/a/${cid}.png`,
      bytes: bytes.byteLength,
      type: "image/png",
      width: 320,
      height: 200,
    });
  });

  it("writes one asset row and one claim, naming the install that published it", async () => {
    const bytes = pngFixture(31, 32);
    await upload(app, OWNER_TOKEN, bytes);
    const cid = sha256hex(bytes);
    const row = await assetRowFor(db.pool, cid);
    expect(row).toMatchObject({
      // Audit only. Who may delete is decided by the claim below, never by this.
      firstPublisherHash: OWNER_HASH,
      contentType: "image/png",
      byteLength: bytes.byteLength,
      width: 31,
      height: 32,
      deletedAt: null,
    });
    expect(await publishersOf(cid)).toEqual([OWNER_HASH]);
  });

  it("decides the type from the bytes and ignores the declared content-type", async () => {
    const bytes = gifFixture(64, 48);
    const response = await upload(app, OWNER_TOKEN, bytes, "image/png");
    expect(response.json()).toMatchObject({
      type: "image/gif",
      url: `${PUBLIC_BASE}/a/${sha256hex(bytes)}.gif`,
    });
  });

  it("is idempotent for the same install: identical bytes are one asset and one claim", async () => {
    const bytes = jpegFixture(120, 80);
    const first = await upload(app, OWNER_TOKEN, bytes);
    const second = await upload(app, OWNER_TOKEN, bytes);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().cid).toBe(first.json().cid);
    expect(await publishersOf(first.json().cid)).toEqual([OWNER_HASH]);
  });

  it("answers a second install the same address and records it as a publisher too", async () => {
    const bytes = jpegFixture(121, 81);
    const owner = await upload(app, OWNER_TOKEN, bytes);
    const stranger = await upload(app, STRANGER_TOKEN, bytes);
    const { cid } = owner.json();
    expect(owner.statusCode).toBe(201);
    expect(stranger.statusCode).toBe(200);
    expect(stranger.json()).toEqual(owner.json());
    // One asset, two claims: a content-addressed store cannot hold a second
    // copy, so the second uploader gets a claim of its own rather than a
    // dependency on a stranger's willingness not to delete.
    expect(await publishersOf(cid)).toEqual([OWNER_HASH, STRANGER_HASH]);
    // The row's own hash records who introduced the bytes and decides nothing.
    expect((await assetRowFor(db.pool, cid))?.firstPublisherHash).toBe(OWNER_HASH);
  });
});

describe("PUT /v1/assets - what it refuses", () => {
  it("refuses a file one byte past the cap", async () => {
    const response = await upload(app, OWNER_TOKEN, padTo(pngFixture(8, 8), MAX_UPLOAD_BYTES + 1));
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("payload_too_large");
  });

  it("accepts a file of exactly the cap", async () => {
    const response = await upload(app, OWNER_TOKEN, padTo(pngFixture(9, 9), MAX_UPLOAD_BYTES));
    expect(response.statusCode).toBe(201);
  });

  it("refuses bytes that are not one of the four image formats", async () => {
    const pdf = new Uint8Array(128);
    pdf.set(new TextEncoder().encode("%PDF-1.7"), 0);
    const response = await upload(app, OWNER_TOKEN, pdf);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("unsupported_image");
  });

  it("refuses an empty body by name rather than storing the hash of nothing", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/v1/assets",
      headers: { ...auth(OWNER_TOKEN), "content-type": "application/octet-stream" },
      payload: Buffer.alloc(0),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation_failed");
  });

  it.each([
    ["json", "application/json", JSON.stringify({ file: "nope" })],
    ["a form", "multipart/form-data; boundary=x", "--x--"],
  ])("refuses %s: this host parses image bytes and nothing else", async (_name, type, payload) => {
    const response = await app.inject({
      method: "PUT",
      url: "/v1/assets",
      headers: { ...auth(OWNER_TOKEN), "content-type": type },
      payload,
    });
    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe("unsupported_media_type");
  });

  it.each([
    ["application/octet-stream", 101],
    ["image/png", 102],
    ["image/jpeg", 103],
    ["image/webp", 104],
    ["image/gif", 105],
  ] as const)(
    "accepts the raw body declared as %s, because the declared type only picks the parser",
    async (declaredType, height) => {
      // Distinct bytes per case: identical bytes would be answered idempotently
      // and would prove nothing about the parser under test.
      const response = await upload(app, OWNER_TOKEN, pngFixture(17, height), declaredType);
      expect(response.statusCode).toBe(201);
      expect(response.json().type).toBe("image/png");
    },
  );

  it("refuses past the count quota, naming the axis", async () => {
    const first = await upload(crampedApp, CRAMPED_TOKEN, pngFixture(11, 12));
    expect(first.statusCode).toBe(201);
    const second = await upload(crampedApp, CRAMPED_TOKEN, pngFixture(13, 14));
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe("quota_exceeded_count");
  });

  it("refuses past the byte quota, naming the axis", async () => {
    // The count limit is 1 and the install above already holds one live asset,
    // so free it first: the byte axis is what must speak here.
    const held = await db.pool.query<{ cid: string }>(
      `SELECT p.cid FROM launch_asset_publishers p
         JOIN launch_assets a ON a.cid = p.cid
        WHERE p.agent_hash = $1 AND a.deleted_at IS NULL`,
      [CRAMPED_HASH],
    );
    for (const row of held.rows) await withdraw(crampedApp, CRAMPED_TOKEN, row.cid);
    const response = await upload(crampedApp, CRAMPED_TOKEN, padTo(pngFixture(15, 16), 400));
    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe("quota_exceeded_bytes");
  });
});

describe("GET /a/<cid>.<ext> - the public read", () => {
  it("serves back bytes that hash to the cid in the URL", async () => {
    const bytes = pngFixture(200, 100);
    const uploaded = await upload(app, OWNER_TOKEN, bytes);
    const { cid, url } = uploaded.json();

    const response = await app.inject({ method: "GET", url: new URL(url).pathname });

    expect(response.statusCode).toBe(200);
    // THE PROMISE: what a viewer receives is what the approval named. Re-hashed
    // here rather than compared to the input, because the digest is the claim.
    expect(sha256hex(response.rawPayload)).toBe(cid);
    expect(Buffer.compare(response.rawPayload, Buffer.from(bytes))).toBe(0);
  });

  it("declares the response immutable, typed, tagged and unsniffable", async () => {
    const bytes = jpegFixture(64, 32);
    const { cid, url } = (await upload(app, OWNER_TOKEN, bytes)).json();
    const response = await app.inject({ method: "GET", url: new URL(url).pathname });
    expect(response.headers).toMatchObject({
      "cache-control": "public, max-age=31536000, immutable",
      etag: `"${cid}"`,
      "content-type": "image/jpeg",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "cross-origin",
    });
    expect(response.headers["content-length"]).toBe(String(bytes.byteLength));
  });

  it("answers 304 to a conditional request carrying the cid", async () => {
    const { cid, url } = (await upload(app, OWNER_TOKEN, jpegFixture(65, 33))).json();
    const response = await app.inject({
      method: "GET",
      url: new URL(url).pathname,
      headers: { "if-none-match": `"${cid}"` },
    });
    expect(response.statusCode).toBe(304);
  });

  it("supports HEAD, with the headers and no body", async () => {
    const bytes = pngFixture(70, 70);
    const { url } = (await upload(app, OWNER_TOKEN, bytes)).json();
    const response = await app.inject({ method: "HEAD", url: new URL(url).pathname });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.rawPayload.byteLength).toBe(0);
  });

  it.each([
    ["a cid that was never published", `/a/${"f".repeat(64)}.png`],
    ["a malformed name", "/a/not-a-cid.png"],
    ["a traversal", "/a/..%2f..%2fetc%2fpasswd"],
  ])("answers 404 to %s", async (_name, url) => {
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(404);
  });

  it("answers 404 to the wrong extension for a stored type, minting no second address", async () => {
    const { cid } = (await upload(app, OWNER_TOKEN, jpegFixture(66, 34))).json();
    const response = await app.inject({ method: "GET", url: `/a/${cid}.png` });
    expect(response.statusCode).toBe(404);
  });
});

describe("DELETE /v1/assets/<cid> - withdrawal is permanent", () => {
  it("refuses a delete from an install that does not publish the asset", async () => {
    const { cid } = (await upload(app, OWNER_TOKEN, pngFixture(41, 42))).json();
    const response = await withdraw(app, STRANGER_TOKEN, cid);
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("forbidden");
    expect((await assetRowFor(db.pool, cid))?.deletedAt).toBeNull();
    expect(await publishersOf(cid)).toEqual([OWNER_HASH]);
  });

  it("refuses an unauthenticated delete", async () => {
    const { cid } = (await upload(app, OWNER_TOKEN, pngFixture(43, 44))).json();
    const response = await app.inject({ method: "DELETE", url: `/v1/assets/${cid}` });
    expect(response.statusCode).toBe(401);
  });

  it("answers 404 for a cid nobody published", async () => {
    const response = await withdraw(app, OWNER_TOKEN, "f".repeat(64));
    expect(response.statusCode).toBe(404);
  });

  it("removes the bytes, tombstones the row, 404s the URL and refuses republication by anyone", async () => {
    const bytes = pngFixture(51, 52);
    const { cid, url } = (await upload(app, OWNER_TOKEN, bytes)).json();
    const store = new AssetByteStore(assetsDir);

    const deleted = await withdraw(app, OWNER_TOKEN, cid);

    expect(deleted.statusCode).toBe(200);
    expect(await store.read(cid)).toBeNull();
    expect((await assetRowFor(db.pool, cid))?.deletedAt).toBeInstanceOf(Date);
    expect((await app.inject({ method: "GET", url: new URL(url).pathname })).statusCode).toBe(404);

    // The tombstone is why the row survives deletion: an attacker holding the
    // same bytes must not be able to resurrect a URL its owner withdrew.
    for (const token of [OWNER_TOKEN, STRANGER_TOKEN]) {
      const republished = await upload(app, token, bytes);
      expect(republished.statusCode).toBe(410);
      expect(republished.json().error.code).toBe("asset_deleted");
    }
  });

  it("is idempotent for the owner and keeps the original withdrawal time", async () => {
    const { cid } = (await upload(app, OWNER_TOKEN, pngFixture(53, 54))).json();
    const first = await withdraw(app, OWNER_TOKEN, cid);
    const deletedAt = (await assetRowFor(db.pool, cid))?.deletedAt;
    const second = await withdraw(app, OWNER_TOKEN, cid);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect((await assetRowFor(db.pool, cid))?.deletedAt).toEqual(deletedAt);
  });
});

describe("shared ownership - one asset, a set of publishers", () => {
  it("keeps the bytes served when a co-publisher withdraws, and tombstones only on the last", async () => {
    const bytes = pngFixture(61, 62);
    const { cid, url } = (await upload(app, OWNER_TOKEN, bytes)).json();
    expect((await upload(app, STRANGER_TOKEN, bytes)).statusCode).toBe(200);
    const store = new AssetByteStore(assetsDir);
    const assetPath = new URL(url).pathname;

    const strangerWithdrew = await withdraw(app, STRANGER_TOKEN, cid);

    // The stranger is gone; the owner is still publishing these bytes, so the
    // URL the owner may already have put on chain keeps working. A tombstone
    // here would let any install revoke a stranger's launched image.
    expect(strangerWithdrew.statusCode).toBe(200);
    expect(await publishersOf(cid)).toEqual([OWNER_HASH]);
    expect((await assetRowFor(db.pool, cid))?.deletedAt).toBeNull();
    expect((await app.inject({ method: "GET", url: assetPath })).statusCode).toBe(200);
    expect(await store.read(cid)).not.toBeNull();

    // A withdrawn claim is not authority any more: the stranger is now a
    // stranger, exactly like an install that never published.
    expect((await withdraw(app, STRANGER_TOKEN, cid)).statusCode).toBe(403);

    const ownerWithdrew = await withdraw(app, OWNER_TOKEN, cid);

    expect(ownerWithdrew.statusCode).toBe(200);
    expect(await publishersOf(cid)).toEqual([]);
    expect((await assetRowFor(db.pool, cid))?.deletedAt).toBeInstanceOf(Date);
    expect(await store.read(cid)).toBeNull();
    expect((await app.inject({ method: "GET", url: assetPath })).statusCode).toBe(404);
    // The tombstone binds everyone, including the install that never withdrew.
    expect((await upload(app, STRANGER_TOKEN, bytes)).statusCode).toBe(410);
  });

  it("charges the claiming install for bytes it did not upload", async () => {
    // A claim is what keeps those bytes on the volume for that install too, so
    // it is quota-bearing: otherwise one uploaded asset plus a thousand claims
    // would be a free unbounded store.
    const shared = pngFixture(63, 64);
    expect((await upload(app, OWNER_TOKEN, shared)).statusCode).toBe(201);
    expect((await upload(crampedApp, CLAIMER_TOKEN, pngFixture(65, 66))).statusCode).toBe(201);

    const response = await upload(crampedApp, CLAIMER_TOKEN, shared);

    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe("quota_exceeded_count");
    expect(await publishersOf(sha256hex(shared))).toEqual([OWNER_HASH]);
  });

  it("makes one asset and two claims out of two concurrent uploads of identical bytes", async () => {
    // THE RACE, held open on purpose. Both requests are parked on this cid's
    // advisory lock - taken here from a third session - so they are provably
    // in flight at the same time before either may read the asset row. Without
    // the cid lock in `publishAsset` both would read "no row" and the second
    // insert would be a unique violation, i.e. a 500 on an ordinary upload.
    const bytes = pngFixture(71, 72);
    const cid = sha256hex(bytes);
    const gate = await db.pool.connect();
    let responses: [number, number];
    try {
      const key = (await gate.query<{ key: number }>("SELECT hashtext($1) AS key", [cid])).rows[0]!
        .key;
      await gate.query("SELECT pg_advisory_lock($1, $2)", [CONTENT_LOCK_CLASS, key]);
      const inFlight = Promise.all([
        upload(app, OWNER_TOKEN, bytes),
        upload(app, STRANGER_TOKEN, bytes),
      ]);
      await waitForBlockedUploads(2);
      await gate.query("SELECT pg_advisory_unlock($1, $2)", [CONTENT_LOCK_CLASS, key]);
      responses = (await inFlight).map((response) => response.statusCode) as [number, number];
    } finally {
      gate.release();
    }

    // One of them stored the bytes and one claimed them; which won the lock is
    // not this test's business, only that the two outcomes are these two.
    expect(responses.sort()).toEqual([200, 201]);
    expect((await publishersOf(cid)).sort()).toEqual([OWNER_HASH, STRANGER_HASH].sort());
    expect((await assetRowFor(db.pool, cid))?.deletedAt).toBeNull();
  });
});

/**
 * Waits until exactly `expected` sessions are queued on an advisory lock. This
 * database is this file's alone, so an ungranted advisory lock is one of our
 * uploads and nothing else. Polling a real condition, never a sleep: the point
 * is that both requests reached the lock, not that some interval elapsed.
 */
async function waitForBlockedUploads(expected: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const blocked = await db.pool.query<{ waiting: number }>(
      "SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted",
    );
    if (blocked.rows[0]!.waiting >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${expected} uploads never queued on the content lock`);
}

describe("GET /healthz", () => {
  it("reports the database and the volume it cannot serve without", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ db: "ok", store: "ok" });
  });
});
