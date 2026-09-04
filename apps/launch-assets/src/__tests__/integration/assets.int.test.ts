/**
 * THE ASSET HOST END TO END, against a real Postgres and a real directory.
 *
 * What only this level can prove, and therefore what it is here for:
 *  - the bytes a reader receives HASH BACK to the cid in the URL. That is the
 *    on-chain promise, and no unit test of the digest can establish it: it has
 *    to survive multipart parsing, a file, a stream and the response;
 *  - the install credential is the ingest credential - the same `agents` row,
 *    with no second table and no second token;
 *  - reporting status does NOT gate this host (coordinator decision I1);
 *  - a deleted cid is 404 forever and cannot be republished BY ANYONE, which
 *    is a rule about two installs and one durable row;
 *  - the quota refuses by the name of the axis it hit.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { startTestDb } from "@agentscan/server/src/testing/pg-harness.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAssetsApp } from "../../app.js";
import { AssetByteStore } from "../../byte-store.js";
import { loadAssetsConfig } from "../../config.js";
import { assetRowFor } from "../../assets-repo.js";
import { gifFixture, jpegFixture, padTo, pngFixture } from "../image-fixtures.js";

const PUBLIC_BASE = "https://assets.test.example";
const MAX_UPLOAD_BYTES = 4096;

const OWNER_HASH = "a".repeat(64);
const STRANGER_HASH = "b".repeat(64);
const REVOKED_HASH = "c".repeat(64);
const QUARANTINED_HASH = "d".repeat(64);
const CRAMPED_HASH = "e".repeat(64);

const OWNER_TOKEN = "A".repeat(43);
const STRANGER_TOKEN = "B".repeat(43);
const REVOKED_TOKEN = "C".repeat(43);
const QUARANTINED_TOKEN = "D".repeat(43);
const CRAMPED_TOKEN = "E".repeat(43);

const sha256hex = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function multipart(bytes: Uint8Array, fileName: string, declaredType: string, fieldName = "file") {
  const boundary = `----vexassets${randomBytes(8).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
      `Content-Type: ${declaredType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, Buffer.from(bytes), tail]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

let db: Awaited<ReturnType<typeof startTestDb>>;
let assetsDir: string;
let app: FastifyInstance;
let crampedApp: FastifyInstance;

const upload = (
  instance: FastifyInstance,
  token: string | null,
  bytes: Uint8Array,
  fileName = "art.png",
  declaredType = "image/png",
  fieldName = "file",
) => {
  const body = multipart(bytes, fileName, declaredType, fieldName);
  return instance.inject({
    method: "PUT",
    url: "/v1/assets",
    payload: body.payload,
    headers: { ...body.headers, ...(token ? auth(token) : {}) },
  });
};

beforeAll(async () => {
  db = await startTestDb();
  assetsDir = await mkdtemp(path.join(tmpdir(), "launch-assets-int-"));
  for (const [agentHash, token, status] of [
    [OWNER_HASH, OWNER_TOKEN, "active"],
    [STRANGER_HASH, STRANGER_TOKEN, "active"],
    [REVOKED_HASH, REVOKED_TOKEN, "revoked"],
    [QUARANTINED_HASH, QUARANTINED_TOKEN, "quarantined"],
    [CRAMPED_HASH, CRAMPED_TOKEN, "active"],
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

  it("writes exactly one audit row, naming the install that published it", async () => {
    const bytes = pngFixture(31, 32);
    await upload(app, OWNER_TOKEN, bytes);
    const row = await assetRowFor(db.pool, sha256hex(bytes));
    expect(row).toMatchObject({
      agentHash: OWNER_HASH,
      contentType: "image/png",
      byteLength: bytes.byteLength,
      width: 31,
      height: 32,
      deletedAt: null,
    });
  });

  it("decides the type from the bytes and ignores the declared content-type", async () => {
    const bytes = gifFixture(64, 48);
    const response = await upload(app, OWNER_TOKEN, bytes, "art.png", "image/png");
    expect(response.json()).toMatchObject({
      type: "image/gif",
      url: `${PUBLIC_BASE}/a/${sha256hex(bytes)}.gif`,
    });
  });

  it("is idempotent for the same install: identical bytes are one asset", async () => {
    const bytes = jpegFixture(120, 80);
    const first = await upload(app, OWNER_TOKEN, bytes);
    const second = await upload(app, OWNER_TOKEN, bytes);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().cid).toBe(first.json().cid);
  });

  it("answers a second install the same address, because a cid names bytes and not an owner", async () => {
    const bytes = jpegFixture(121, 81);
    const owner = await upload(app, OWNER_TOKEN, bytes);
    const stranger = await upload(app, STRANGER_TOKEN, bytes);
    expect(stranger.statusCode).toBe(200);
    expect(stranger.json().cid).toBe(owner.json().cid);
    // Publication does not transfer ownership: the first publisher stays the
    // only install that may delete it.
    expect((await assetRowFor(db.pool, owner.json().cid))?.agentHash).toBe(OWNER_HASH);
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

  it("refuses a multipart part that is not named `file`", async () => {
    const response = await upload(app, OWNER_TOKEN, pngFixture(10, 10), "art.png", "image/png", "image");
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation_failed");
  });

  it("refuses a body that is not multipart at all", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/v1/assets",
      headers: { ...auth(OWNER_TOKEN), "content-type": "application/json" },
      payload: JSON.stringify({ file: "nope" }),
    });
    expect(response.statusCode).toBe(415);
  });

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
      "SELECT cid FROM launch_assets WHERE agent_hash = $1 AND deleted_at IS NULL",
      [CRAMPED_HASH],
    );
    for (const row of held.rows) {
      await crampedApp.inject({
        method: "DELETE",
        url: `/v1/assets/${row.cid}`,
        headers: auth(CRAMPED_TOKEN),
      });
    }
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
  it("refuses a delete from an install that did not publish the asset", async () => {
    const { cid } = (await upload(app, OWNER_TOKEN, pngFixture(41, 42))).json();
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/assets/${cid}`,
      headers: auth(STRANGER_TOKEN),
    });
    expect(response.statusCode).toBe(403);
    expect((await assetRowFor(db.pool, cid))?.deletedAt).toBeNull();
  });

  it("refuses an unauthenticated delete", async () => {
    const { cid } = (await upload(app, OWNER_TOKEN, pngFixture(43, 44))).json();
    const response = await app.inject({ method: "DELETE", url: `/v1/assets/${cid}` });
    expect(response.statusCode).toBe(401);
  });

  it("answers 404 for a cid nobody published", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/assets/${"f".repeat(64)}`,
      headers: auth(OWNER_TOKEN),
    });
    expect(response.statusCode).toBe(404);
  });

  it("removes the bytes, tombstones the row, 404s the URL and refuses republication by anyone", async () => {
    const bytes = pngFixture(51, 52);
    const { cid, url } = (await upload(app, OWNER_TOKEN, bytes)).json();
    const store = new AssetByteStore(assetsDir);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/assets/${cid}`,
      headers: auth(OWNER_TOKEN),
    });

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
    const first = await app.inject({
      method: "DELETE",
      url: `/v1/assets/${cid}`,
      headers: auth(OWNER_TOKEN),
    });
    const deletedAt = (await assetRowFor(db.pool, cid))?.deletedAt;
    const second = await app.inject({
      method: "DELETE",
      url: `/v1/assets/${cid}`,
      headers: auth(OWNER_TOKEN),
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect((await assetRowFor(db.pool, cid))?.deletedAt).toEqual(deletedAt);
  });
});

describe("GET /healthz", () => {
  it("reports the database and the volume it cannot serve without", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ db: "ok", store: "ok" });
  });
});
