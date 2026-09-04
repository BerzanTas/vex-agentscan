-- migrate:up
-- THE AUDIT AND OWNERSHIP RECORD FOR PUBLIC LAUNCH ART.
--
-- The launch-assets host (`apps/launch-assets`) stores the bytes of the image a user puts on a
-- token they launch. The bytes live on that service's own volume, content-addressed by their
-- sha256; this table is the metadata: what a cid IS, which install published it, and whether it
-- has been withdrawn.
--
-- NO FOREIGN KEY TO `agents`, AND NONE TO `activities`, DELIBERATELY. `agent_hash` records which
-- install uploaded an asset so deletion can be authorized, but this store is independent of
-- reporting consent: withdrawing consent to AgentScan reporting, or being purged from it, must not
-- 404 the image of a token that is already launched and pointing at this URL from its on-chain
-- metadata. The column is therefore a recorded identity, not a reference.
--
-- `cid` IS THE PRIMARY KEY, so identity is global rather than per install. That is what makes the
-- deletion rule enforceable: once an owner deletes an asset the row STAYS, carrying `deleted_at`,
-- and both the public route and the upload route read it. A deleted cid is 404 forever and cannot
-- be re-published by anyone - if it could, an attacker who obtained the bytes could resurrect a URL
-- its owner deliberately withdrew.
--
-- `byte_length` is BIGINT rather than INT because it is a size, and a size column that has to be
-- widened later is a migration nobody wants; the 2 MB upload cap is enforced by the service, not
-- by the column.
CREATE TABLE launch_assets (
  cid TEXT PRIMARY KEY CHECK (cid ~ '^[0-9a-f]{64}$'),
  agent_hash TEXT NOT NULL CHECK (agent_hash ~ '^[0-9a-f]{64}$'),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp','image/gif')),
  byte_length BIGINT NOT NULL CHECK (byte_length > 0),
  width INT NOT NULL CHECK (width > 0),
  height INT NOT NULL CHECK (height > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- The quota read is "count and sum the bytes of this install's LIVE assets", which is the only
-- query on this table that is not by primary key.
CREATE INDEX launch_assets_live_owner_idx ON launch_assets (agent_hash) WHERE deleted_at IS NULL;

-- migrate:down
DROP INDEX launch_assets_live_owner_idx;
DROP TABLE launch_assets;
