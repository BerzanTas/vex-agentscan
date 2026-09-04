-- migrate:up
-- THE AUDIT AND OWNERSHIP RECORD FOR PUBLIC LAUNCH ART.
--
-- The launch-assets host (`apps/launch-assets`) stores the bytes of the image a user puts on a
-- token they launch. The bytes live on that service's own volume, content-addressed by their
-- sha256; these two tables are the metadata: what a cid IS (`launch_assets`), and which installs
-- have published it (`launch_asset_publishers`).
--
-- WHY OWNERSHIP IS A SECOND TABLE. Two installs can hold the same file, and a content-addressed
-- store cannot hold a second copy of it, so ownership is a SET, not a column. The first uploader
-- creates the asset row and the first publisher row; a later install uploading identical bytes adds
-- only a publisher row. Each publisher may withdraw its own claim, and the asset is tombstoned when
-- the last claim goes - so one install can never delete a URL another install is depending on, and
-- the bytes survive exactly as long as somebody is still publishing them.
--
-- `first_publisher_hash` IS AUDIT ONLY. It records who introduced these bytes to the host and is
-- read by nothing that decides anything: authorization to delete, and the quota, are both computed
-- from `launch_asset_publishers`. It is kept rather than dropped because "who put this on the
-- internet first" is the question an operator asks about a public image and no other column
-- answers it after the first publisher withdraws.
--
-- NO FOREIGN KEY TO `agents`, AND NONE TO `activities`, DELIBERATELY. Both hash columns record
-- which install acted, but this store is independent of reporting consent: withdrawing consent to
-- AgentScan reporting, or being purged from it, must not 404 the image of a token that is already
-- launched and pointing at this URL from its on-chain metadata. They are recorded identities, not
-- references.
--
-- `cid` IS THE PRIMARY KEY, so identity is global rather than per install. That is what makes the
-- deletion rule enforceable: once the last publisher withdraws, the row STAYS, carrying
-- `deleted_at`, and both the public route and the upload route read it. A deleted cid is 404
-- forever and cannot be re-published by anyone - if it could, an attacker who obtained the bytes
-- could resurrect a URL its owner deliberately withdrew.
--
-- `byte_length` is BIGINT rather than INT because it is a size, and a size column that has to be
-- widened later is a migration nobody wants; the 2 MB upload cap is enforced by the service, not
-- by the column.
CREATE TABLE launch_assets (
  cid TEXT PRIMARY KEY CHECK (cid ~ '^[0-9a-f]{64}$'),
  first_publisher_hash TEXT NOT NULL CHECK (first_publisher_hash ~ '^[0-9a-f]{64}$'),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp','image/gif')),
  byte_length BIGINT NOT NULL CHECK (byte_length > 0),
  width INT NOT NULL CHECK (width > 0),
  height INT NOT NULL CHECK (height > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- A claim by one install on one cid. The primary key is what makes a re-upload by the same install
-- idempotent rather than a second claim, and the ON DELETE of the asset row is deliberately absent:
-- asset rows are tombstoned, never deleted, so a cascade would never fire.
CREATE TABLE launch_asset_publishers (
  cid TEXT NOT NULL REFERENCES launch_assets(cid),
  agent_hash TEXT NOT NULL CHECK (agent_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cid, agent_hash)
);

-- The quota read is "count and sum the bytes of the assets this install still publishes and that
-- are not tombstoned", which is the only query on these tables that is not by primary key.
CREATE INDEX launch_asset_publishers_owner_idx ON launch_asset_publishers (agent_hash);

-- migrate:down
DROP INDEX launch_asset_publishers_owner_idx;
DROP TABLE launch_asset_publishers;
DROP TABLE launch_assets;
