#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <backup-object-name>" >&2
  exit 1
fi

deploy_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$deploy_dir"

set -a
. ./.env
set +a

: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE must be set}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE must be set}"
: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"

rclone cat "$RCLONE_REMOTE/$1" \
  | age -d -i "$AGE_IDENTITY_FILE" \
  | docker compose exec -T postgres pg_restore --clean --if-exists --no-owner \
      -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "restore complete: $1"
echo "note: agents whose consent was revoked after this backup was taken will be re-purged automatically on the next purge sweep"
