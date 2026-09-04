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
type and dimensions, the `agent_hash` of every install publishing them, and two
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

This section is the whole contract a client needs; the prose under each entry
explains why it is shaped that way and adds nothing to it.

Every error response is `{"error": {"code", "message", "correlationId"}}`, and
the same correlation id is on the `x-correlation-id` response header and in
every log line for the request.

| method | path | request headers | body | success |
|---|---|---|---|---|
| `PUT` | `/v1/assets` | `authorization: Bearer <ingestToken>`, `content-type: application/octet-stream` (or `image/png`, `image/jpeg`, `image/webp`, `image/gif`) | the image bytes, raw | `201` new asset / `200` already published, both `{cid, url, bytes, type, width, height}` |
| `GET` | `/a/<cid>.<ext>` | none; optional `if-none-match: "<cid>"` | none | `200` the bytes / `304` unchanged |
| `HEAD` | `/a/<cid>.<ext>` | none | none | `200`, headers only |
| `DELETE` | `/v1/assets/<cid>` | `authorization: Bearer <ingestToken>` | none | `200 {cid, status: "deleted"}` |
| `GET` | `/healthz` | none | none | `200 {db, store}` |

Every error this host can answer, with the status it carries:

| status | code | route | when |
|---|---|---|---|
| 400 | `validation_failed` | `PUT` | the body is empty |
| 400 | `validation_failed` | `DELETE` | the path segment is not 64 lowercase hex |
| 400 | `unsupported_image` | `PUT` | the bytes are not one of the four formats, or the header carries no readable or plausible dimensions, or they are too few bytes to be an image |
| 401 | `unauthorized` | `PUT`, `DELETE` | missing, malformed or unknown bearer token |
| 403 | `forbidden` | `DELETE` | the caller does not publish this asset |
| 404 | `asset_not_found` | `GET`, `HEAD` | the name is not `<64 hex>.<ext>`, no row exists, the asset is tombstoned, or the extension is not the canonical one for the stored type |
| 404 | `asset_not_found` | `DELETE` | no install ever published this cid |
| 404 | `not_found` | any | no such route |
| 410 | `asset_deleted` | `PUT` | this cid was published and later withdrawn by its last publisher; it can never be published again, by anyone |
| 413 | `payload_too_large` | `PUT` | past `ASSETS_MAX_UPLOAD_BYTES`; refused while reading, so the payload past the cap is never buffered |
| 415 | `unsupported_media_type` | `PUT` | the `content-type` is not one this host parses |
| 429 | `quota_exceeded_count` / `quota_exceeded_bytes` | `PUT` | the caller's quota, named by the axis that is full |
| 500 | `internal` | any | a fault on our side; the correlation id is the handle |
| 503 | `asset_unavailable` | `GET`, `HEAD` | the row exists and the volume does not have the bytes (an operator incident) |
| 503 | `database_unavailable` | any | the connection pool is exhausted; carries `retry-after` |

### `PUT /v1/assets`

Publish an image. Authenticated with the install's handshake-minted ingest
token - the same credential `POST /v1/events` uses, in the `Authorization:
Bearer <ingestToken>` header.

Request: **the image bytes are the body**, with no envelope around them.
`Content-Type` selects the parser and nothing else - send
`application/octet-stream`, or the image type if the client knows it - and the
STORED type is decided by magic bytes, never by what the request declared. A
type this host does not parse is `415`; there is no multipart, no form and no
JSON parser on this service, because the only client is the Vex engine sending
one buffer and a parser on a trust boundary that nothing needs is ownership
without benefit.

```
PUT /v1/assets HTTP/1.1
authorization: Bearer <ingestToken>
content-type: application/octet-stream
content-length: 51234

<the 51234 bytes of the image>
```

| rule | value |
|---|---|
| size cap | `ASSETS_MAX_UPLOAD_BYTES`, default 2 MiB (2097152), enforced as Fastify's `bodyLimit` so an oversized request is refused while it is read. Exactly the cap is accepted; one byte more is refused |
| accepted types | `image/png`, `image/jpeg`, `image/webp` (VP8/VP8L/VP8X), `image/gif` (87a and 89a), each decided by magic bytes |
| dimensions | read from the header, no decode; both sides must be between 1 and 8192 |
| quota | `ASSETS_MAX_PER_INSTALL` live assets and `ASSETS_MAX_BYTES_PER_INSTALL` live bytes per install, counted over the assets the install still publishes; a withdrawn claim frees its quota immediately |

Response `201` when this call published new bytes, `200` when the exact bytes
were already published - by this install (a re-upload is idempotent and costs
no quota) or by another one (the caller becomes a publisher too). The body is
identical in all three cases:

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

Errors: the `PUT` rows of the table at the top of this section.

**Ownership is a SET, not an owner.** Identical bytes from a SECOND install are
answered `200` with the same cid and url - a content-addressed store cannot
hold a second copy, and refusing would deny a caller a URL that already serves
exactly the bytes it uploaded - and that install becomes a publisher of the
asset in its own right: it is charged quota for it, and it may withdraw its own
claim. Nothing about the first publisher changes. The asset is tombstoned only
when the LAST claim goes, so no install can revoke a URL another install has
already put on chain, and no install depends on a stranger's willingness not to
delete. `launch_assets.first_publisher_hash` records who introduced the bytes
and decides nothing: authorization and quota are both computed from
`launch_asset_publishers`.

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

Withdraw THIS install's claim on an asset. Authenticated as above; a caller
that does not publish the asset is `403`.

Response `200 {"cid": "...", "status": "deleted"}`, idempotent: withdrawing
from an already-tombstoned cid succeeds and keeps the original withdrawal time,
so a client that retries a delete it never saw the answer to is never told the
asset is gone by a `403`.

Errors: the `DELETE` rows of the table at the top of this section.

While another install still publishes the same bytes, a withdrawal removes only
the caller's claim: the row stays live and the URL keeps serving. The
withdrawal of the LAST claim removes the bytes and tombstones the row. The row
survives on purpose: a tombstoned cid is 404 forever and cannot be republished
by anyone, including a former publisher. Without the tombstone, anyone holding
a copy of the bytes could resurrect a URL its publishers deliberately withdrew.

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

The metadata is not on the volume: `launch_assets` and
`launch_asset_publishers` (migration `db/migrations/0020_launch_assets.sql`)
are the single source of truth for what an asset is, which installs publish it
and whether it has been withdrawn. Neither carries a foreign key to `agents` or
`activities`, because this store must survive a
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
  the URL, HEAD, conditional GET, withdrawal, the permanent tombstone across two
  installs, unauthenticated and foreign writes, both quota axes, the audit rows,
  the shared-ownership rules (a co-publisher's withdrawal keeps the URL alive,
  the last one tombstones and unlinks, a claim costs the claimer quota), and two
  concurrent uploads of identical bytes parked on the same advisory lock from a
  third session, which is the only way to prove they yield one asset row and two
  claims rather than a unique violation.
