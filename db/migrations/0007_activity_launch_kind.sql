-- migrate:up
ALTER TABLE activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE activities ADD CONSTRAINT activities_kind_check CHECK (kind IN ('swap','bridge','launch'));

ALTER TABLE activities DROP CONSTRAINT activities_event_role_check;
ALTER TABLE activities ADD CONSTRAINT activities_event_role_check
  CHECK (event_role IN ('swap','bridge_deposit','bridge_fill_expected','bridge_fill_observed','bridge_refund','token_launch'));

-- migrate:down
ALTER TABLE activities DROP CONSTRAINT activities_event_role_check;
ALTER TABLE activities ADD CONSTRAINT activities_event_role_check
  CHECK (event_role IN ('swap','bridge_deposit','bridge_fill_expected','bridge_fill_observed','bridge_refund'));

ALTER TABLE activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE activities ADD CONSTRAINT activities_kind_check CHECK (kind IN ('swap','bridge'));
