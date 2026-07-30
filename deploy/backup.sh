#!/bin/sh
set -eu

deploy_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$deploy_dir"

set -a
. ./.env
set +a

: "${AGE_RECIPIENT:?AGE_RECIPIENT must be set}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE must be set}"
: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"
: "${BACKUP_RETENTION_DAYS:=30}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$RCLONE_REMOTE/agentscan-$stamp.dump.age"

docker compose exec -T postgres pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | age -r "$AGE_RECIPIENT" \
  | rclone rcat "$target"

rclone delete --min-age "${BACKUP_RETENTION_DAYS}d" "$RCLONE_REMOTE"

echo "backup uploaded: $target"
