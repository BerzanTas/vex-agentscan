# launch-assets

The public, content-addressed image host for the art a user puts on a token
they launch. It is its own Fastify app, its own container, its own Caddy
routes and its own storage volume. It shares exactly one thing with the
AgentScan API: the install credential, which both verify through
`@agentscan/install-identity`.

## Why it exists, and why it is content-addressed

A launchpad's `image` field is a URL that goes on chain. If the user could
supply any public URL, the bytes behind it could change after the approval was
signed - the picture a user consented to and the picture the world later sees
would be two different things, with nothing on chain able to tell them apart.
So this host addresses every asset by the sha256 of its bytes: a different
picture is a different URL, and the URL in the approval is a promise the
service can keep. That is coordinator decision I1; the mutable-URL fallback
was removed rather than kept as an option.

## Privacy: what an upload means

**Bytes uploaded here become public.** They are served by hash to anyone who
has the URL, with no authentication, and they are retained permanently until
the install that published them deletes them. The Vex approval says exactly
this before an upload happens; nothing is uploaded from a user's image locker
without it.

What is NOT public: nothing else. This service stores the bytes, their size,
type and dimensions, the `agent_hash` of the publishing install, and two
timestamps. It never receives a filename, a wallet, a token, an activity or
anything from the reporting stream.

**Reporting consent does not gate this host.** An install whose AgentScan
status is `revoked` or `quarantined` may still upload and delete. Those states
belong to the activity-reporting stream - `revoked` means "stop publishing my
activity", `quarantined` means "your events are suspect" - and neither is a
statement about token art. Coupling them would mean that withdrawing consent to
analytics silently removes the ability to launch a token with a picture. The
bound that protects this host is the per-install quota, not a consent flag.

## The contract

Every error response is `{"error": {"code", "message", "correlationId"}}`, and
the same correlation id is on the `x-correlation-id` response header and in
every log line for the request.

### `PUT /v1/assets`

Publish an image. Authenticated with the install's handshake-minted ingest
token - the same credential `POST /v1/events` uses, in the `Authorization:
Bearer <ingestToken>` header.

Request: `multipart/form-data` with exactly one file part named `file`. The
part's declared `Content-Type` and filename are read by nothing: the stored
type is decided by magic bytes.

| rule | value |
|---|---|
| size cap | `ASSETS_MAX_UPLOAD_BYTES`, default 2 MiB (2097152). Exactly the cap is accepted; one byte more is refused |
| accepted types | `image/png`, `image/jpeg`, `image/webp` (VP8/VP8L/VP8X), `image/gif` (87a and 89a), each decided by magic bytes |
| dimensions | read from the header, no decode; both sides must be between 1 and 8192 |
| quota | `ASSETS_MAX_PER_INSTALL` live assets and `ASSETS_MAX_BYTES_PER_INSTALL` live bytes per install; deleted assets free their quota |

Response `201` on a new asset, `200` when the exact bytes were already
published (a re-upload is idempotent), body identical in both cases:

```json
{
  "cid": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "url": "https://agentscan.example.com/a/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08.png",
  "bytes": 51234,
  "type": "image/png",
  "width": 512,
  "height": 512
}
```

`cid` is the lowercase-hex sha256 of the exact bytes. `url` is
`<ASSETS_PUBLIC_BASE>/a/<cid>.<ext>` with one canonical extension per type:
`png`, `jpg`, `webp`, `gif`. It is the only URL this host will serve for that
asset.

| status | code | when |
|---|---|---|
| 400 | `validation_failed` | no multipart file part, or the part is not named `file` |
| 400 | `unsupported_image` | the bytes are not one of the four formats, or the header carries no readable or plausible dimensions |
| 401 | `unauthorized` | missing, malformed or unknown bearer token |
| 410 | `asset_deleted` | this cid was published and then deleted by its owner; it can never be published again, by anyone |
| 413 | `payload_too_large` | past the size cap |
| 415 | `unsupported_media_type` | the request body is not `multipart/form-data` |
| 429 | `quota_exceeded_count` / `quota_exceeded_bytes` | the install's quota, named by the axis that is full |

Identical bytes from a SECOND install are answered `200` with the same cid and
url: a content-addressed store cannot hold a second copy, and refusing would
deny a caller a URL that already serves exactly the bytes it uploaded.
Ownership does not transfer - the first publisher stays the only install that
may delete it.

### `GET /a/<cid>.<ext>` and `HEAD /a/<cid>.<ext>`

Public, unauthenticated, immutable.

```
200 OK
cache-control: public, max-age=31536000, immutable
etag: "<cid>"
content-type: image/png
content-length: 51234
content-disposition: inline; filename="<cid>.png"
x-content-type-options: nosniff
content-security-policy: default-src 'none'; sandbox
cross-origin-resource-policy: cross-origin
```

A conditional request whose `if-none-match` is the cid gets `304`. `HEAD` is
supported. Range requests are not; the size cap makes them pointless.

`404 asset_not_found` covers all four ways to miss, deliberately identically:
the name is not `<64 hex>.<ext>`, no row exists, the asset was deleted, or the
extension is not the canonical one for the stored type. There is no directory
listing - this is a route with a parameter, not a static server over the store.

`503 asset_unavailable` means the row exists but the volume does not have the
bytes. It is an operator incident (see `deploy/OBSERVABILITY.md` section 6) and
is deliberately not a 404, so a lost volume can never be mistaken for a
deletion.

### `DELETE /v1/assets/<cid>`

Withdraw an asset. Authenticated as above; only the install that published it
may delete it.

Response `200 {"cid": "...", "status": "deleted"}`, idempotent: deleting an
already-deleted asset succeeds and keeps the original withdrawal time.

| status | code | when |
|---|---|---|
| 400 | `validation_failed` | the path segment is not a content id |
| 401 | `unauthorized` | missing, malformed or unknown bearer token |
| 403 | `forbidden` | a different install published this asset |
| 404 | `asset_not_found` | no install ever published this cid |

Deletion removes the bytes and tombstones the row. The row survives on
purpose: a deleted cid is 404 forever and cannot be republished by anyone,
including its original owner. Without the tombstone, anyone holding a copy of
the bytes could resurrect a URL its owner deliberately withdrew.

### `GET /healthz`

`{"db": "ok", "store": "ok"}` or `503`. Checks one `SELECT 1` and one `stat`
of `ASSETS_DIR`.

## Storage

Bytes live under `ASSETS_DIR`, sharded two levels from the cid:
`ab/cd/<cid>.bin`. The `.bin` is deliberate - the real type is the row's,
recorded after magic-byte validation, and a typed name on disk would invite a
later reader to trust the extension over the validation that actually
happened.

Publication is atomic and never overwrites: bytes are written to
`ASSETS_DIR/tmp`, flushed, then published with `link()`, which fails `EEXIST`
rather than replacing a file that is already there. Two concurrent uploads of
identical bytes therefore both succeed and neither can observe a half-written
file.

The metadata is not on the volume: `launch_assets` (migration
`db/migrations/0020_launch_assets.sql`) is the single source of truth for what
an asset is, who published it and whether it has been withdrawn. It carries no
foreign key to `agents` or `activities`, because this store must survive a
reporting purge - a token already pointing at one of these URLs does not stop
existing when its publisher withdraws from analytics.

**The volume and the database must be restored together.** A restore that
takes one generation of the database and another of the volume produces rows
whose bytes are missing (503) or bytes no row reaches (invisible, and reused by
the next upload of the same content).

## Configuration

See the `launch-assets host` block in `deploy/.env.example`. `ASSETS_DIR` and
`ASSETS_PUBLIC_BASE` are required; the public base must be https and must not
be the dev default when `NODE_ENV=production`, because it is part of a URL
users approve and tokens carry on chain.

## Tests

- unit (`pnpm exec vitest run --project unit apps/launch-assets`): the
  magic-byte matrix, the size and dimension bounds, cid derivation and path
  sharding, the byte store's containment and never-overwrite rules, quota
  arithmetic at both boundaries;
- integration (`pnpm exec vitest run --project integration apps/launch-assets`):
  a real Postgres through the shared testcontainers harness and a real
  directory - upload, read back and re-hash the served bytes against the cid in
  the URL, HEAD, conditional GET, delete, the permanent tombstone across two
  installs, unauthenticated and foreign writes, both quota axes, and the audit
  rows.
